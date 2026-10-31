import { prisma } from '../../../infra/database/prismaClient';
import { AppError } from '../../../infra/errors/app-error';
import { recordAudit } from '../../audit/use-cases/record-audit.usecase';
import type { Ator } from '../../audit/audit.types';
import { conferirSenha, hashSenha } from '../helpers/password.helper';

interface TrocaDaPropriaSenha {
  /** Ausente só na troca obrigatória, a da senha temporária (AU). */
  currentPassword?: string;
  newPassword: string;
}

/**
 * A pessoa troca a PRÓPRIA senha (AR): pede a atual, e a nova vale no próximo
 * login. É também o fim da senha temporária — zera `mustChangePassword`.
 *
 * Pede a senha ATUAL porque a sessão sozinha não prova quem está no teclado: um
 * computador deixado aberto, ou um cookie roubado, não pode virar a troca da senha
 * da conta.
 *
 * MENOS na troca obrigatória (AU): a conta com a temporária acabou de digitá-la
 * no login, e essa sessão não alcança mais nada além desta troca. Pedir de novo
 * seria repetir a mesma prova na tela seguinte. Ali a nova só não pode ser a
 * própria temporária.
 *
 * Derruba as OUTRAS sessões (`tokenVersion`) e o controller reemite o cookie desta
 * (`reemitirSessao`): a pessoa não é mandada ao login pela própria troca.
 *
 * O erro de "atual não confere" é 422, e não 401: a sessão é válida, é o dado que
 * está errado — um 401 faria o painel dizer "sessão expirada" e voltar ao login.
 * O teto contra quem adivinha a senha atual com a sessão roubada é o de 20/min por
 * IP da rota (`auth.maestro.ts`); não conta contra a trava de login, porque isso
 * deixaria quem roubou a sessão travar o dono fora da própria conta.
 */
export async function changeOwnPassword(userId: string, data: TrocaDaPropriaSenha, ator: Ator): Promise<void> {
  const conta = await prisma.user.findFirst({
    where: { id: userId, isActive: true },
    select: { email: true, passwordHash: true, mustChangePassword: true },
  });
  if (!conta) throw new AppError('Sessão ausente ou expirada. Faça login.', 401);

  if (conta.mustChangePassword) {
    if (await conferirSenha(conta.passwordHash, data.newPassword)) {
      throw new AppError('Escolha uma senha sua, diferente da temporária.', 422);
    }
  } else {
    if (data.currentPassword === undefined) throw new AppError('senha atual é obrigatória', 422);
    if (!(await conferirSenha(conta.passwordHash, data.currentPassword))) {
      throw new AppError('A senha atual não confere.', 422);
    }
    if (data.currentPassword === data.newPassword) {
      throw new AppError('A nova senha precisa ser diferente da atual.', 422);
    }
  }

  // O hash FORA da transação: argon2 é lento de propósito.
  const passwordHash = await hashSenha(data.newPassword);

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: {
        passwordHash,
        mustChangePassword: false,
        // Quem trocou a senha provou que a sabe: a contagem de erros recomeça.
        failedLoginCount: 0,
        lockedUntil: null,
        tokenVersion: { increment: 1 },
      },
    });
    await recordAudit(tx, {
      entityType: 'User', entityId: userId, entityLabel: conta.email, action: 'UPDATE',
      changes: { senha: 'alterada' },
    }, ator);
  });
}
