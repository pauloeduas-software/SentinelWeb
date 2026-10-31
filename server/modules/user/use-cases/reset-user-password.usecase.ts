import { prisma } from '../../../infra/database/prismaClient';
import { AppError } from '../../../infra/errors/app-error';
import { recordAudit } from '../../audit/use-cases/record-audit.usecase';
import type { Ator } from '../../audit/audit.types';
import { hashSenha } from '../../auth/helpers/password.helper';
import { gerarSenhaTemporaria } from '../helpers/temporary-password.helper';

/**
 * O administrador gera uma senha temporária para outra conta (AR).
 *
 * A conta fica marcada (`mustChangePassword`): com a senha temporária a pessoa só
 * alcança "quem sou eu", "sair" e a troca da própria senha, e escolhe a dela no
 * primeiro acesso. Derruba as sessões abertas da conta (`tokenVersion`) e destrava
 * o login — é o caminho de quem esqueceu a senha ou se trancou fora.
 *
 * A senha sai UMA vez, na resposta: o servidor só guarda o hash, e nada dela vai
 * para a auditoria nem para o log.
 *
 * Para a PRÓPRIA conta é 409: a sua você troca com a senha atual, em Minha conta.
 * Gerar uma temporária para si mesmo só o jogaria para fora do sistema.
 */
export async function resetUserPassword(id: string, sessaoId: string, ator: Ator): Promise<{ temporaryPassword: string }> {
  if (id === sessaoId) {
    throw new AppError('Para trocar a sua senha use Minha conta. A senha temporária é para a conta de outra pessoa.', 409);
  }

  const temporaryPassword = gerarSenhaTemporaria();
  // O hash FORA da transação: argon2 é lento de propósito.
  const passwordHash = await hashSenha(temporaryPassword);

  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${id}::uuid FOR NO KEY UPDATE`;
    const conta = await tx.user.findFirst({ where: { id }, select: { email: true } });
    if (!conta) throw new AppError('Registro não encontrado', 404);

    await tx.user.update({
      where: { id },
      data: {
        passwordHash,
        mustChangePassword: true,
        failedLoginCount: 0,
        lockedUntil: null,
        tokenVersion: { increment: 1 },
      },
    });
    await recordAudit(tx, {
      entityType: 'User', entityId: id, entityLabel: conta.email, action: 'UPDATE',
      changes: { senha: 'temporária' },
    }, ator);
  });

  return { temporaryPassword };
}
