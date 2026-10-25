import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { recordActivity } from '../../activity/use-cases/record-activity.usecase';
import { contarForaDe, travarItemOuFalhar } from '../helpers/stock-balance.helper';

/**
 * Manda o item para a lixeira — recusando enquanto houver unidade FORA.
 *
 * O item tem lixeira porque a leitura aninhada dele é de HISTÓRICO (o nome do
 * item na saída de março), e apagar de verdade levaria o histórico junto. Mas
 * um item com unidade na rua não some de vista: a unidade continuaria contando
 * como fora, na mão de alguém, e a tela que ofereceria a devolução responderia
 * 404 — é o mesmo 409 que o ativo dá pela licença entregue a ele.
 *
 * POR QUE NÃO O BANCO: apagar aqui é `UPDATE stock_items SET "deletedAt"`, o
 * Postgres não vê `DELETE` nenhum e a FK não é consultada — o ponto cego do
 * soft delete.
 *
 * A TRAVA vem antes da contagem: sem ela, uma saída simultânea cria a linha
 * DEPOIS deste `count`.
 */
export async function deleteStockItem(id: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await travarItemOuFalhar(tx, id);

    const fora = await contarForaDe(tx, id);
    if (fora > 0) {
      throw new AppError(
        `Este item tem ${fora} ${fora === 1 ? 'unidade' : 'unidades'} fora do estoque. `
          + 'Devolva-as antes de excluir.',
        409,
      );
    }

    const { count } = await tx.stockItem.updateMany({
      where: { id, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (count === 0) throw new AppError('Este item já está na lixeira.', 409);

    await recordActivity(tx, { entityType: 'StockItem', entityId: id, action: 'DELETE' });
  });
}
