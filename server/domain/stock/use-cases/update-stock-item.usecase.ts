import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { recordAudit } from '../../audit/use-cases/record-audit.usecase';
import type { Ator } from '../../audit/audit.types';
import { buildChanges } from '../../shared/diff.helper';
import { comSaldo, contarForaDe, travarItemOuFalhar } from '../helpers/stock-balance.helper';
import { STOCK_ITEM_SELECT } from '../helpers/stock-select.helper';
import { assertLocalRecebe } from '../../catalog/helpers/catalog-lock.helper';
import type { UpdateStockItemInput } from '../schemas/stock.schema';
import { assertCategoriaDeEstoque, assertNomeLivre } from './create-stock-item.usecase';

// `qty` NÃO está aqui, e a ausência é a regra: quantidade muda por ENTRADA e
// BAIXA (`adjust-stock.usecase.ts`), que deixam linha de movimento. A chave
// nem existe no schema de edição — o `strictObject` devolve 422 sozinho.
const CAMPOS_AUDITADOS = ['name', 'categoryId', 'locationId', 'notes'] as const;

export async function updateStockItem(id: string, data: UpdateStockItemInput, ator: Ator) {
  return prisma.$transaction(async (tx) => {
    // A trava do item primeiro, como a saída: o "de" da auditoria é lido com a
    // linha presa, e o grafo continua item → categoria, item → posto.
    await travarItemOuFalhar(tx, id);
    const antes = await tx.stockItem.findFirst({ where: { id }, select: STOCK_ITEM_SELECT });
    if (!antes) throw new AppError('Item de estoque não encontrado.', 404);

    if (data.categoryId !== undefined) await assertCategoriaDeEstoque(tx, data.categoryId, antes.categoryId);
    if (data.name !== undefined) await assertNomeLivre(tx, data.name, id);
    // Local desativado não recebe estoque NOVO — só quando o local muda: o
    // formulário reenvia todo campo.
    if (data.locationId && data.locationId !== antes.locationId) {
      await assertLocalRecebe(tx, data.locationId, 'estoque novo');
    }

    const depois = await tx.stockItem.update({
      where: { id },
      data: {
        name: data.name,
        categoryId: data.categoryId,
        locationId: data.locationId,
        notes: data.notes,
      },
      select: STOCK_ITEM_SELECT,
    });

    const changes = buildChanges(antes, depois, CAMPOS_AUDITADOS);
    if (Object.keys(changes).length > 0) {
      await recordAudit(tx, {
        entityType: 'StockItem', entityId: id, entityLabel: depois.name, action: 'UPDATE', changes,
      }, ator);
    }

    // Com saldo, como toda leitura de item: a tela substitui a linha pela
    // resposta e não pode perder o `disponivel` nessa troca.
    return comSaldo(depois, await contarForaDe(tx, id));
  });
}
