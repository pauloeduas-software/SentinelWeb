import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { recordActivity } from '../../activity/use-cases/record-activity.usecase';

export async function deleteUser(id: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.user.updateMany({
      where: { id, deletedAt: null },
      data: { deletedAt: new Date() },
    });

    if (count === 0) throw new AppError('Registro não encontrado', 404);

    await recordActivity(tx, { entityType: 'User', entityId: id, action: 'DELETE' });
  });
}
