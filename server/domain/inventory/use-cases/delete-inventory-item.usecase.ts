import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { recordActivity } from '../../activity/use-cases/record-activity.usecase';

// Soft delete: a linha continua no banco com `deletedAt` preenchido e some de
// todas as consultas (core/database/soft-delete.extension.ts). Apagar de
// verdade não tem volta — e a devolução de um item excluído por engano era
// impossível.
export async function deleteInventoryItem(id: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // `deletedAt: null` explícito: item já na lixeira responde 404 em vez de ser
    // "apagado" de novo e sobrescrever a data original da exclusão.
    const { count } = await tx.inventoryItem.updateMany({
      where: { id, deletedAt: null },
      data: { deletedAt: new Date() },
    });

    if (count === 0) throw new AppError('Registro não encontrado', 404);

    await recordActivity(tx, { entityType: 'InventoryItem', entityId: id, action: 'DELETE' });
  });
}
