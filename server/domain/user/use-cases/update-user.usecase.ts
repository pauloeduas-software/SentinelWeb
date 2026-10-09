import { assertSobraAdministrador } from '../../access/helpers/ultimo-administrador';
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
  /** O papel (D148). Ausente = não mexe. */
  role?: 'USUARIO' | 'TECNICO' | 'ADMIN';
  /** O id do departamento (F11, Etapa D). A coluna de texto não é mais escrita. */
  departmentId?: string | null;
  employeeNumber?: string | null;
  jobTitle?: string | null;
  phone?: string | null;
  address?: string | null;
  hiredAt?: Date | null;
  managerId?: string | null;
}

// O DIFF É SOBRE IDS, não sobre nomes: o log guarda o que foi gravado. Se
// guardasse "Comercial" e alguém renomeasse o departamento, o histórico passaria
// a contar uma mudança que não houve nesta pessoa.
const CAMPOS_AUDITADOS = [
  'name', 'email', 'departmentId', 'employeeNumber', 'jobTitle', 'phone', 'address',
  'hiredAt', 'managerId', 'role',
] as const;

/**
 * O select do DIFF — o público mais os campos auditados.
 *
 * Não é o `USER_PUBLIC_SELECT`: ele deixou de trazer o departamento na F11
 * (D135), e `buildChanges` comparando um campo que o "antes" não tem marcaria
 * como alterado tudo que foi enviado. É a mesma armadilha que o
 * `CatalogSpec.select` documenta ("precisa conter todo campo de `audited`").
 */
const SELECT_DO_DIFF = {
  id: true, name: true, email: true, departmentId: true, employeeNumber: true,
  jobTitle: true, phone: true, address: true, hiredAt: true, managerId: true, role: true,
} as const;

export async function updateUser(id: string, data: UpdateUserData, actorId: string | null) {
  return prisma.$transaction(async (tx) => {
    const antes = await tx.user.findFirst({ where: { id }, select: SELECT_DO_DIFF });
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
        departmentId: data.departmentId,
        employeeNumber: data.employeeNumber,
        jobTitle: data.jobTitle,
        phone: data.phone,
        address: data.address,
        hiredAt: data.hiredAt,
        managerId: data.managerId,
        role: data.role,
      },
      select: SELECT_DO_DIFF,
    });

    const changes = buildChanges(antes, depois, CAMPOS_AUDITADOS);
    if (Object.keys(changes).length > 0) {
      await recordActivity(tx, { entityType: 'User', entityId: id, action: 'UPDATE', changes }, actorId);
    }

    // A REDE, como ÚLTIMA instrução antes da leitura de saída (D148): rebaixar o
    // único administrador que entra desfaz a transação inteira. Roda sempre, e não
    // só quando `data.role` veio — o custo é um `count` e a alternativa é lembrar
    // de chamá-la em cada caminho novo que mexa em papel.
    await assertSobraAdministrador(tx);

    // Devolve pelo select PÚBLICO, não pelo do diff: o cliente recebe o mesmo
    // formato de toda rota que devolve usuário, e os campos de auditoria não
    // vazam por aqui.
    return tx.user.findFirstOrThrow({ where: { id }, select: USER_PUBLIC_SELECT });
  });
}
