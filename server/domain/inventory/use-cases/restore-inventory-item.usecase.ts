import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { recordActivity } from '../../activity/use-cases/record-activity.usecase';
import { INVENTORY_ITEM_SELECT } from '../helpers/inventory-select.helper';

// Restaura um item da lixeira. O `deletedAt: { not: null }` no where é o que faz
// a extension de soft delete sair do caminho e enxergar a linha apagada.
export async function restoreInventoryItem(id: string) {
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.inventoryItem.updateMany({
      where: { id, deletedAt: { not: null } },
      data: { deletedAt: null },
    });

    if (count === 0) throw new AppError('Item não está na lixeira.', 404);

    await recordActivity(tx, { entityType: 'InventoryItem', entityId: id, action: 'RESTORE' });

    return tx.inventoryItem.findFirstOrThrow({ where: { id }, select: INVENTORY_ITEM_SELECT });
  });
}
