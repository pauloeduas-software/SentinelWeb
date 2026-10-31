import type { FastifyReply } from 'fastify';
import { prisma } from '../../../infra/database/prismaClient';
import { AppError } from '../../../infra/errors/app-error';
import { COOKIE_SESSAO, opcoesCookieSessao } from './session-cookie.helper';

/**
 * Grava de novo o cookie de quem acabou de trocar a PRÓPRIA senha.
 *
 * Trocar a senha incrementa o `tokenVersion`, e isso derruba toda sessão aberta
 * da conta — que é o que se quer das outras, e não da que acabou de trocar: a
 * pessoa que digita a senha nova não pode ser mandada de volta ao login. Então a
 * resposta traz um cookie assinado com a geração nova, e só a sessão que trocou
 * sobrevive. Quem trocou a senha de OUTRA pessoa não passa por aqui: a sessão
 * dele não mudou.
 *
 * Relê o número no banco, e não o recebe do use-case: o use-case não conhece
 * cookie nem JWT, e o `tokenVersion` não sai dele para fora da camada.
 */
export async function reemitirSessao(reply: FastifyReply, userId: string): Promise<void> {
  const conta = await prisma.user.findFirst({
    where: { id: userId, isActive: true },
    select: { tokenVersion: true },
  });
  if (!conta) throw new AppError('Sessão ausente ou expirada. Faça login.', 401);

  const token = await reply.jwtSign({ sub: userId, tv: conta.tokenVersion });
  reply.setCookie(COOKIE_SESSAO, token, opcoesCookieSessao());
}
