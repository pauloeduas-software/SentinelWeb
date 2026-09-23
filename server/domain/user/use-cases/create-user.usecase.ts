import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { recordActivity } from '../../activity/use-cases/record-activity.usecase';
import { USER_PUBLIC_SELECT } from '../helpers/user-select.helper';

export interface CreateUserData {
  name: string;
  email: string;
  department?: string | null;
}

export async function createUser(data: CreateUserData, actorId: string | null) {
  return prisma.$transaction(async (tx) => {
    // `findFirst`, não `findUnique`: `email` deixou de ser @unique no Prisma — a
    // unicidade virou índice PARCIAL (`WHERE deleted_at IS NULL`), para um
    // usuário na lixeira não bloquear o recadastro do mesmo e-mail. E
    // `findFirst` passa pelo escopo da lixeira, então só colide com quem vive.
    const exists = await tx.user.findFirst({ where: { email: data.email } });
    if (exists) throw new AppError('E-mail já está em uso.', 409);

    const user = await tx.user.create({
      data: {
        name: data.name,
        email: data.email,
        department: data.department ?? null,
      },
      select: USER_PUBLIC_SELECT,
    });

    await recordActivity(
      tx,
      {
        entityType: 'User',
        entityId: user.id,
        action: 'CREATE',
        changes: { name: user.name, email: user.email, department: user.department },
      },
      actorId,
    );

    return user;
  });
}
