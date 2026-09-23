import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { buildChanges } from '../../shared/diff.helper';
import { recordActivity } from '../../activity/use-cases/record-activity.usecase';
import { USER_PUBLIC_SELECT } from '../helpers/user-select.helper';

// Campos que o formulário edita. A lista é explícita de propósito: a rota antiga
// repassava `request.body` inteiro para o Prisma, e qualquer campo enviado a
// mais era gravado (mass assignment).
export interface UpdateUserData {
  name?: string;
  email?: string;
  department?: string | null;
}

const CAMPOS_AUDITADOS = ['name', 'email', 'department'] as const;

export async function updateUser(id: string, data: UpdateUserData) {
  return prisma.$transaction(async (tx) => {
    const antes = await tx.user.findFirst({ where: { id }, select: USER_PUBLIC_SELECT });
    if (!antes) throw new AppError('Registro não encontrado', 404);

    // O índice único do e-mail é parcial e o Prisma não o conhece: a colisão
    // viria como erro cru do banco. Conferir aqui devolve o mesmo 409 do cadastro.
    if (data.email && data.email !== antes.email) {
      const emUso = await tx.user.findFirst({ where: { email: data.email, id: { not: id } } });
      if (emUso) throw new AppError('E-mail já está em uso.', 409);
    }

    const depois = await tx.user.update({
      where: { id },
      data: {
        name: data.name,
        email: data.email,
        department: data.department,
      },
      select: USER_PUBLIC_SELECT,
    });

    const changes = buildChanges(antes, depois, CAMPOS_AUDITADOS);
    if (Object.keys(changes).length > 0) {
      await recordActivity(tx, { entityType: 'User', entityId: id, action: 'UPDATE', changes });
    }

    return depois;
  });
}
