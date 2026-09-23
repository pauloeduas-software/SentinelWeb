import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { recordActivity } from '../../activity/use-cases/record-activity.usecase';
import { USER_PUBLIC_SELECT } from '../helpers/user-select.helper';

export async function restoreUser(id: string, actorId: string | null) {
  return prisma.$transaction(async (tx) => {
    const naLixeira = await tx.user.findFirst({
      where: { id, deletedAt: { not: null } },
      select: { email: true },
    });

    if (!naLixeira) throw new AppError('Usuário não está na lixeira.', 404);

    // O índice único é PARCIAL (só entre os vivos), então o e-mail pode ter sido
    // recadastrado enquanto este usuário estava na lixeira. Restaurar às cegas
    // estouraria uma violação de unicidade crua vinda do banco.
    const emUso = await tx.user.findFirst({ where: { email: naLixeira.email } });
    if (emUso) throw new AppError('O e-mail deste usuário já está em uso por outro cadastro.', 409);

    await tx.user.updateMany({ where: { id, deletedAt: { not: null } }, data: { deletedAt: null } });
    await recordActivity(tx, { entityType: 'User', entityId: id, action: 'RESTORE' }, actorId);

    return tx.user.findFirstOrThrow({ where: { id }, select: USER_PUBLIC_SELECT });
  });
}
