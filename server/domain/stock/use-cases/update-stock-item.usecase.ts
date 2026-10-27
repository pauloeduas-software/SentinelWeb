import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { recordAudit } from '../../audit/use-cases/record-audit.usecase';
import type { Ator } from '../../audit/audit.types';
import { buildChanges } from '../../shared/diff.helper';
import { assertVersaoLida } from '../../shared/versao.helper';
import { assertLocalRecebe } from '../../catalog/helpers/catalog-lock.helper';
import { comContagem, contarUsoDe, fraseDoPiso, travarItemOuFalhar } from '../helpers/stock-balance.helper';
import { CAMPOS_AUDITADOS_DO_ITEM, STOCK_ITEM_SELECT } from '../helpers/stock-select.helper';
import type { UpdateStockItemInput } from '../schemas/stock.schema';
import { assertCategoriaDeEstoque, assertNomeLivre } from './create-stock-item.usecase';

/**
 * A EDIÇÃO — e ela pode mudar o total, como a da licença muda a quantidade
 * comprada (AE).
 *
 * `qty` é o TOTAL: chegaram mais, a recontagem deu outro número — digitar isso
 * É a correção, e nunca abaixo de 1 (o item que acabou se desativa). Aumentar
 * sempre pode. Reduzir não passa do que está em uso: as unidades existem, estão
 * com alguém, e o total que diz menos do que isso é uma afirmação falsa sobre o
 * almoxarifado.
 *
 * TROCAR ENTRE ESTOQUE E COMPONENTE (a categoria de outro tipo, AI) só sem
 * unidade em uso: a que está com a Laura viraria componente fora de um
 * computador, e a instalada num computador viraria mouse dentro da máquina.
 *
 * `isActive: false` é o DESATIVAR, e passa MESMO COM UNIDADE FORA — a tela
 * pergunta antes, com a frase das Configurações. É o Encerrar da licença:
 * avisa, não recusa.
 * O item não recebe entrega nova, e o que está com alguém continua até voltar.
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
      const tipo = await assertCategoriaDeEstoque(tx, data.categoryId, antes.categoryId);
      if (tipo !== antes.category.type) {
        const { emUso } = await contarUsoDe(tx, id);
        if (emUso > 0) {
          const de = antes.category.type === 'COMPONENT' ? 'componente' : 'estoque';
          const para = tipo === 'COMPONENT' ? 'componente' : 'estoque';
          throw new AppError(
            `"${antes.name}" tem ${emUso === 1 ? '1 unidade em uso' : `${emUso} unidades em uso`} e não pode `
            + `passar de ${de} para ${para}. ${de === 'componente' ? 'Retire' : 'Devolva'} antes de trocar a categoria.`,
            409,
          );
        }
      }
    }
    if (data.name !== undefined) await assertNomeLivre(tx, data.name, id);
    // Local desativado não recebe estoque NOVO — só quando o local muda.
    if (data.locationId && data.locationId !== antes.locationId) {
      await assertLocalRecebe(tx, data.locationId, 'estoque novo');
    }

    if (data.qty !== undefined && data.qty < antes.qty) {
      const { emUso } = await contarUsoDe(tx, id);
      if (data.qty < emUso) throw new AppError(fraseDoPiso(antes.name, data.qty, emUso), 409);
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
