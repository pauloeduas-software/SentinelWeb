import type { FastifyRequest } from 'fastify';

/**
 * Quem está fazendo isto — o `actorId` do D23.
 *
 * UM lugar só, e é de propósito: o ator sai da SESSÃO, nunca do corpo da
 * requisição. Um `actorId` que viesse no JSON seria auditoria assinada pelo
 * próprio auditado — qualquer cliente poderia carimbar a ação no nome de outra
 * pessoa, e o log pareceria idôneo.
 *
 * Devolve `null` em vez de estourar nas rotas públicas (login, /health), onde
 * `request.user` não existe: ali não há ator, e isso é a verdade, não uma falha.
 */
export function atorDaRequisicao(request: FastifyRequest): string | null {
  return request.user?.id ?? null;
}
