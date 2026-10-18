import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { recordActivity } from '../../activity/use-cases/record-activity.usecase';
import { USER_PUBLIC_SELECT } from '../helpers/user-select.helper';
import { assertTemSenha, hashSeHouver } from '../helpers/credencial.helper';

interface CreateUserData {
  name: string;
  email: string;
  /** O cargo (D148). Ausente nasce `USUARIO`, pelo `@default` do schema. */
  role?: 'USUARIO' | 'TECNICO' | 'ADMIN';
  /** Obrigatória para Técnico e Administrador (`credencial.helper.ts`). */
  password?: string;
}

export async function createUser(data: CreateUserData, actorId: string | null) {
  // Antes da transação: é validação do corpo, e o hash é lento.
  assertTemSenha(data.role ?? 'USUARIO', data.password !== undefined);
  const passwordHash = await hashSeHouver(data.password);

  return prisma.$transaction(async (tx) => {
    // `findFirst`, não `findUnique`: `email` deixou de ser @unique no Prisma — a
    // unicidade virou índice PARCIAL (`WHERE "deletedAt" IS NULL`), para um
    // usuário na lixeira não bloquear o recadastro do mesmo e-mail. E
    // `findFirst` passa pelo escopo da lixeira, então só colide com quem vive.
    const exists = await tx.user.findFirst({ where: { email: data.email } });
    if (exists) throw new AppError('E-mail já está em uso.', 409);

    const user = await tx.user.create({
      data: {
        name: data.name,
        email: data.email,
        // Ausente cai no `@default(USUARIO)` do schema — e é por isso que aqui
        // não há `?? 'USUARIO'`: a porta fechada por padrão mora num lugar só.
        role: data.role,
        passwordHash,
      },
      select: USER_PUBLIC_SELECT,
    });

    await recordActivity(
      tx,
      {
        entityType: 'User',
        entityId: user.id,
        action: 'CREATE',
        // O QUE mudou, nunca o VALOR: hash em trilha de auditoria é o mesmo
        // vazamento do log com senha, só que permanente e com data.
        changes: {
          name: user.name, email: user.email,
          ...(passwordHash ? { credencial: 'senha definida' } : {}),
        },
      },
      actorId,
    );

    return user;
  });
}
