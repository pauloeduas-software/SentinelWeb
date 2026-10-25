import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { recordAudit } from '../../audit/use-cases/record-audit.usecase';
import type { Ator } from '../../audit/audit.types';
import { buildSnapshot } from '../../shared/diff.helper';
import {
  assertEscolhaAtiva, assertLocalRecebe, lerCategoriaTravada,
} from '../../catalog/helpers/catalog-lock.helper';
import type { ClienteQueTrava } from '../../person/use-cases/lock-person.usecase';
import { comSaldo, type ClienteEstoque } from '../helpers/stock-balance.helper';
import { STOCK_ITEM_SELECT } from '../helpers/stock-select.helper';
import type { CreateStockItemInput } from '../schemas/stock.schema';

/** O retrato do item na auditoria — o cadastro e a exclusão (`delete-stock-item`). */
export const CAMPOS_AUDITADOS = ['name', 'qty', 'categoryId', 'locationId', 'notes'] as const;

/**
 * A categoria do item tem que ser do tipo ESTOQUE.
 *
 * O banco não impede — a FK aceita qualquer categoria —, e é o `type` que
 * separa: um item de estoque numa categoria de ATIVO é o mesmo erro que "Em
 * Uso" tipado DEPLOYABLE foi na F1. 422 e não 404: a categoria existe, o tipo
 * dela é que não serve.
 *
 * Lida `FOR SHARE`: a troca de tipo da categoria trava a linha antes de contar
 * os itens, e esta leitura espera por ela em vez de aprovar o tipo velho.
 */
export async function assertCategoriaDeEstoque(
  client: ClienteEstoque & ClienteQueTrava,
  categoryId: string,
  /** A categoria de ANTES, na edição: desativada só é recusada quando muda. */
  categoriaAtual?: string,
): Promise<void> {
  const categoria = await lerCategoriaTravada(client, categoryId);
  if (!categoria) throw new AppError('Categoria não encontrada.', 404);
  if (categoria.type !== 'STOCK') {
    throw new AppError(
      `A categoria de um item de estoque precisa ser do tipo Estoque, e "${categoria.name}" não é.`,
      422,
    );
  }
  if (categoryId !== categoriaAtual) assertEscolhaAtiva(categoria, { rotulo: 'A categoria', feminino: true });
}

/**
 * O nome é único entre os vivos (índice parcial). Conferir antes é o que
 * transforma o P2002 cru num 409 que diz o nome — e que deixa o item da lixeira
 * fora da conta, porque é ela que pode ser restaurada.
 */
export async function assertNomeLivre(client: ClienteEstoque, name: string, ignorarId?: string): Promise<void> {
  const outro = await client.stockItem.findFirst({
    where: { name, ...(ignorarId ? { id: { not: ignorarId } } : {}) },
    select: { id: true },
  });
  if (outro) throw new AppError(`Já existe um item de estoque chamado "${name}".`, 409);
}

export async function createStockItem(data: CreateStockItemInput, ator: Ator) {
  return prisma.$transaction(async (tx) => {
    await assertCategoriaDeEstoque(tx, data.categoryId);
    await assertNomeLivre(tx, data.name);
    // O local de guarda: existe (404) e não foi desativado (409) — a mesma
    // porta de quem entrega ou guarda ativo (`assertLocalRecebe`).
    if (data.locationId) await assertLocalRecebe(tx, data.locationId, 'estoque novo');

    const item = await tx.stockItem.create({
      data: {
        name: data.name,
        categoryId: data.categoryId,
        qty: data.qty,
        locationId: data.locationId ?? null,
        notes: data.notes ?? null,
      },
      select: STOCK_ITEM_SELECT,
    });

    // A QUANTIDADE INICIAL É A PRIMEIRA ENTRADA. Sem esta linha, a movimentação
    // do item começaria "do nada" com 10 unidades no total e nenhum movimento
    // que as explicasse — e o total deixaria de ser a soma do que entrou.
    if (data.qty > 0) {
      await tx.stockMovement.create({
        data: { itemId: item.id, kind: 'ENTRADA', qty: data.qty, notes: 'cadastro' },
      });
    }

    await recordAudit(tx, {
      entityType: 'StockItem',
      entityId: item.id,
      entityLabel: item.name,
      action: 'CREATE',
      changes: buildSnapshot(item, CAMPOS_AUDITADOS),
    }, ator);

    // COM SALDO, como a listagem e o detalhe: uma forma só de item na API.
    // `fora` é zero por construção — nada saiu de um item que acabou de nascer.
    return comSaldo(item, 0);
  });
}
