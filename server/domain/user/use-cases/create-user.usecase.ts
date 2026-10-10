import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { recordActivity } from '../../activity/use-cases/record-activity.usecase';
import { USER_PUBLIC_SELECT } from '../helpers/user-select.helper';

export interface CreateUserData {
  name: string;
  email: string;
  /** O papel (D148). Ausente nasce `USUARIO`, pelo `@default` do schema. */
  role?: 'USUARIO' | 'TECNICO' | 'ADMIN';
  employeeNumber?: string | null;
  jobTitle?: string | null;
  phone?: string | null;
  address?: string | null;
  hiredAt?: Date | null;
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
        employeeNumber: data.employeeNumber ?? null,
        jobTitle: data.jobTitle ?? null,
        phone: data.phone ?? null,
        address: data.address ?? null,
        hiredAt: data.hiredAt ?? null,
        // Ausente cai no `@default(USUARIO)` do schema — e é por isso que aqui
        // não há `?? 'USUARIO'`: a porta fechada por padrão mora num lugar só.
        role: data.role,
      },
      select: USER_PUBLIC_SELECT,
    });

    await recordActivity(
      tx,
      {
        entityType: 'User',
        entityId: user.id,
        action: 'CREATE',
        changes: {
          name: user.name, email: user.email,
          employeeNumber: data.employeeNumber ?? null,
        },
      },
      actorId,
    );

    return user;
  });
}
