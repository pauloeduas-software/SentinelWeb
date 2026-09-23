import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { recordActivity } from '../../activity/use-cases/record-activity.usecase';

/**
 * Manda para a lixeira. O ativo TEM soft delete, ao contrário do catálogo (D8):
 * aqui a linha carrega histórico de compra, garantia e posse, e apagar de
 * verdade é perda de dado, não de cadastro.
 */
export async function deleteAsset(id: string, actorId: string | null): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.asset.updateMany({
      where: { id, deletedAt: null },
      data: { deletedAt: new Date() },
    });

    if (count === 0) throw new AppError('Registro não encontrado', 404);

    await recordActivity(tx, { entityType: 'Asset', entityId: id, action: 'DELETE' }, actorId);
  });
}
