import type { FastifyRequest } from 'fastify';
import { AppError } from '../../../core/errors/app-error';

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

/**
 * Quem está fazendo isto, QUANDO não pode ser ninguém — as rotas `/api/me/*`.
 *
 * O `atorDaRequisicao` acima devolve `null` nas rotas públicas e isso é certo
 * para auditoria: "sem ator" é um fato que o log precisa poder registrar. Mas
 * uma rota que fala sobre SI MESMA não tem como seguir com `null` — ela não teria
 * de quem listar os tokens, e um `userId: null` no `where` devolveria a lista de
 * outra pessoa (ou a do agente).
 *
 * Então aqui o `null` é defeito de montagem e lança 401: só se chega a esta
 * função depois do `preHandler` de sessão, e se ele deixou passar sem usuário é
 * porque a rota foi declarada pública por engano. A alternativa — `?? ''` — faria
 * a consulta rodar com um id impossível e devolver 200 com lista vazia, que é o
 * tipo de bug que ninguém encontra.
 */
export function sessaoDaRequisicao(request: FastifyRequest): { userId: string } {
  const userId = request.user?.id;
  if (!userId) throw new AppError('Sessão ausente ou expirada. Faça login.', 401);
  return { userId };
}
