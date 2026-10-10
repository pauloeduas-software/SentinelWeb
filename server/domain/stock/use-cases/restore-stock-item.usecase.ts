import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { recordActivity } from '../../activity/use-cases/record-activity.usecase';
import { STOCK_ITEM_SELECT } from '../helpers/stock-select.helper';
import { assertNomeLivre } from './create-stock-item.usecase';

/**
 * Restaura da lixeira.
 *
 * O índice único do nome é PARCIAL (só entre os vivos), então o nome pode ter
 * sido reaproveitado enquanto este item estava na lixeira. Restaurar às cegas
 * estouraria uma violação de unicidade crua vinda do banco.
 */
export async function restoreStockItem(id: string, actorId: string | null) {
  return prisma.$transaction(async (tx) => {
    const naLixeira = await tx.stockItem.findFirst({
      where: { id, deletedAt: { not: null } },
      select: { name: true },
    });
    if (!naLixeira) throw new AppError('Item não está na lixeira.', 404);

    await assertNomeLivre(tx, naLixeira.name, id);

    await tx.stockItem.updateMany({ where: { id, deletedAt: { not: null } }, data: { deletedAt: null } });
    await recordActivity(tx, { entityType: 'StockItem', entityId: id, action: 'RESTORE' }, actorId);

    return tx.stockItem.findFirstOrThrow({ where: { id }, select: STOCK_ITEM_SELECT });
  });
}
