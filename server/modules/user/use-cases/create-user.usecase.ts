import { prisma } from '../../../infra/database/prismaClient';
import { AppError } from '../../../infra/errors/app-error';
import { recordAudit } from '../../audit/use-cases/record-audit.usecase';
import type { Ator } from '../../audit/audit.types';
import { buildSnapshot } from '../../shared/diff.helper';
import {
  CAMPOS_AUDITADOS_DO_USUARIO, USER_AUDIT_SELECT, USER_PUBLIC_SELECT, soPublico,
} from '../helpers/user-select.helper';
import { hashSenha } from '../../auth/helpers/password.helper';
import { gerarSenhaTemporaria } from '../helpers/temporary-password.helper';
import type { Cargo } from '../../access/helpers/cargo';

interface CreateUserData {
  name: string;
  email: string;
  /** O cargo (D148). Ausente nasce `ADMIN`, pelo `@default` do schema. */
  role?: Cargo;
  /**
   * Só o comando de terminal (AP) manda: ali quem roda é a própria pessoa, que
   * escolhe a dela. A tela não manda, e a conta nasce com a temporária.
   */
  password?: string;
}

/**
 * A conta nasce com uma SENHA TEMPORÁRIA (AU), como a que o administrador gera
 * para quem esqueceu (AR): sai uma vez, na resposta, e a pessoa escolhe a dela no
 * primeiro acesso. Quem cadastra nunca sabe a senha que fica.
 */
export async function createUser(data: CreateUserData, ator: Ator) {
  const temporaryPassword = data.password === undefined ? gerarSenhaTemporaria() : undefined;
  // O hash FORA da transação: argon2 leva ~50 ms, e segurar uma conexão do
  // pool durante o cálculo é transformar cadastro em fila de banco.
  const passwordHash = await hashSenha(data.password ?? temporaryPassword ?? '');

  return prisma.$transaction(async (tx) => {
    // O `@unique` do e-mail pegaria a colisão, mas com o "Registro já existe"
    // genérico do P2002; conferir antes devolve a frase que diz o quê.
    const exists = await tx.user.findUnique({ where: { email: data.email } });
    if (exists) throw new AppError('E-mail já está em uso.', 409);

    const usuario = await tx.user.create({
      data: {
        name: data.name,
        email: data.email,
        // Ausente cai no `@default(ADMIN)` do schema — e é por isso que aqui
        // não há `?? 'ADMIN'`: o padrão mora num lugar só.
        role: data.role,
        passwordHash,
        mustChangePassword: temporaryPassword !== undefined,
      },
      select: { ...USER_PUBLIC_SELECT, ...USER_AUDIT_SELECT },
    });

    // A conta nova por escrito, sem a senha (AB).
    await recordAudit(tx, {
      entityType: 'User',
      entityId: usuario.id,
      entityLabel: usuario.email,
      action: 'CREATE',
      changes: buildSnapshot(usuario, CAMPOS_AUDITADOS_DO_USUARIO),
    }, ator);

    return { ...soPublico(usuario), ...(temporaryPassword ? { temporaryPassword } : {}) };
  });
}
