import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { recordAudit } from '../../audit/use-cases/record-audit.usecase';
import type { Ator } from '../../audit/audit.types';
import { buildChanges } from '../../shared/diff.helper';
import { assertVersaoLida } from '../../shared/versao.helper';
import { assertLocalExiste } from '../../catalog/helpers/catalog-lock.helper';
import { comContagem, contarUsoDe, fraseDoPiso, travarItemOuFalhar } from '../helpers/stock-balance.helper';
import { CAMPOS_AUDITADOS_DO_ITEM, STOCK_ITEM_SELECT } from '../helpers/stock-select.helper';
import type { UpdateStockItemInput } from '../schemas/stock.schema';
import { assertCategoriaDeEstoque, assertNomeLivre } from './create-stock-item.usecase';

/** O tipo da categoria como a frase o diz. */
const ROTULO_DO_TIPO: Record<string, string> = {
  STOCK: 'estoque', COMPONENT: 'componente', CONSUMABLE: 'consumível',
};

/**
 * A EDIÇÃO — e ela pode mudar o total, como a da licença muda a quantidade
 * comprada (AE).
 *
 * `qty` é o TOTAL, o que existe: chegaram mais, a recontagem deu outro número —
 * digitar isso É a correção, e pode chegar a 0, o item que acabou (AJ). Aumentar
 * sempre pode. Reduzir não passa do que está em uso: as unidades existem, estão
 * com alguém, e o total que diz menos do que isso é uma afirmação falsa sobre o
 * almoxarifado.
 *
 * TROCAR ENTRE ESTOQUE, COMPONENTE E CONSUMÍVEL (a categoria de outro tipo, AI e
 * AJ) só sem unidade em uso: a que está com a Laura viraria componente fora de
 * um computador, a instalada num computador viraria mouse dentro da máquina, e
 * a que está em uso viraria consumível sem nunca ter sido consumida. O
 * consumível nunca tem unidade em uso, e passa a estoque sempre.
 *
 * `isActive: false` é o DESATIVAR, e só SEM UNIDADE EM USO — o padrão do
 * sistema para o que depende de outra coisa em uso, e o do Encerrar da
 * licença. O arquivar do Snipe-IT recusa o acessório com unidade entregue da
 * mesma forma. Desativado, o item não recebe entrega nova.
 *
 * A TRAVA DO ITEM vem primeiro e serializa a edição com a entrega: sem ela, a
 * edição contava "2 em uso", uma entrega gravava a terceira, e o total descia
 * abaixo do que está na rua.
 */
export async function updateStockItem(id: string, data: UpdateStockItemInput, ator: Ator) {
  return prisma.$transaction(async (tx) => {
    await travarItemOuFalhar(tx, id);
    const antes = await tx.stockItem.findUniqueOrThrow({ where: { id }, select: STOCK_ITEM_SELECT });
    // O formulário aberto antes de outra pessoa mudar o total ou desativar (AF).
    assertVersaoLida(antes.updatedAt, data.updatedAt, antes.name);

    if (data.categoryId !== undefined) {
      const tipo = await assertCategoriaDeEstoque(tx, data.categoryId);
      if (tipo !== antes.category.type) {
        const { emUso } = await contarUsoDe(tx, id);
        if (emUso > 0) {
          const de = ROTULO_DO_TIPO[antes.category.type];
          const para = ROTULO_DO_TIPO[tipo];
          throw new AppError(
            `"${antes.name}" tem ${emUso === 1 ? '1 unidade em uso' : `${emUso} unidades em uso`} e não pode `
            + `passar de ${de} para ${para}. ${de === 'componente' ? 'Retire' : 'Devolva'} antes de trocar a categoria.`,
            409,
          );
        }
      }
    }
    if (data.name !== undefined) await assertNomeLivre(tx, data.name, id);
    // O local novo existe? Só quando muda: o formulário reenvia todo campo.
    if (data.locationId && data.locationId !== antes.locationId) {
      await assertLocalExiste(tx, data.locationId);
    }

    if (data.qty !== undefined && data.qty < antes.qty) {
      const { emUso } = await contarUsoDe(tx, id);
      if (data.qty < emUso) throw new AppError(fraseDoPiso(antes.name, data.qty, emUso), 409);
    }

    if (data.isActive === false && antes.isActive) {
      const { emUso } = await contarUsoDe(tx, id);
      if (emUso > 0) {
        const retirar = antes.category.type === 'COMPONENT';
        throw new AppError(
          `"${antes.name}" tem ${emUso === 1 ? '1 unidade em uso' : `${emUso} unidades em uso`} e não pode ser `
          + `desativado. ${retirar ? 'Retire' : 'Devolva'} antes.`,
          409,
        );
      }
    }

    const depois = await tx.stockItem.update({
      where: { id },
      data: {
        name: data.name,
        categoryId: data.categoryId,
        qty: data.qty,
        locationId: data.locationId,
        notes: data.notes,
        isActive: data.isActive,
      },
      select: STOCK_ITEM_SELECT,
    });

    const changes = buildChanges(antes, depois, CAMPOS_AUDITADOS_DO_ITEM);
    if (Object.keys(changes).length > 0) {
      await recordAudit(tx, {
        entityType: 'StockItem', entityId: id, entityLabel: depois.name, action: 'UPDATE', changes,
      }, ator);
    }

    // Com a conta, como toda leitura de item: a tela substitui a linha pela
    // resposta e não pode perder o `disponivel` nessa troca.
    return comContagem(depois, await contarUsoDe(tx, id));
  });
}
