import type { FastifyRequest } from 'fastify';
import type { Ator } from '../../audit/audit.types';

/**
 * Quem está fazendo isto — o autor da auditoria (AB).
 *
 * UM lugar só, e é de propósito: o autor sai da SESSÃO, nunca do corpo da
 * requisição. Um autor que viesse no JSON seria auditoria assinada pelo próprio
 * auditado — qualquer cliente poderia carimbar a ação no nome de outra conta, e
 * a linha pareceria idônea.
 *
 * `request.user` é a conta relida do banco a cada requisição
 * (`authenticate-request.helper.ts`), então o nome e o e-mail são os de agora,
 * não os de quando o token foi emitido. O `request.id` é o mesmo `X-Request-Id`
 * do log do servidor: é ele que casa a linha da auditoria com a requisição.
 */
export function atorDaRequisicao(request: FastifyRequest): Ator {
  return {
    tipo: 'USER',
    id: request.user.id,
    nome: request.user.name,
    email: request.user.email,
    requestId: request.id,
  };
}
