import type { FastifyRequest } from 'fastify';

/**
 * DE ONDE veio a tentativa — o que a trilha de autenticação grava ao lado do
 * "o quê".
 *
 * Existe separado do `actor.helper.ts` porque os dois respondem perguntas
 * diferentes e em momentos diferentes: o ator é QUEM está autenticado (sai da
 * sessão, e no login ainda não há nenhuma), enquanto isto aqui é o ENVELOPE da
 * requisição — e é justamente na tentativa que FALHA, onde não há ator, que ele
 * é mais útil.
 */
export interface ContextoDaRequisicao {
  ip: string | null;
  userAgent: string | null;
}

/**
 * O `user-agent` vai TRUNCADO em 255.
 *
 * O cabeçalho é texto livre controlado por quem chama: sem limite, um cliente
 * hostil grava megabytes por tentativa numa tabela que ninguém poda — a trilha
 * de auditoria vira o vetor de lotar o disco. 255 cobre qualquer navegador real
 * com folga.
 *
 * O `ip` sai do `request.ip` do Fastify, que já resolve `X-Forwarded-For`
 * quando `trustProxy` está ligado — e, quando não está, devolve o IP do socket.
 * Atrás de proxy sem `trustProxy` isso é o IP do proxy: registrar o do balanceador
 * é inútil, mas confiar no cabeçalho sem configurar é pior (qualquer um forja a
 * própria origem no log). A decisão fica no boot, não aqui.
 */
export function contextoDaRequisicao(request: FastifyRequest): ContextoDaRequisicao {
  const userAgent = request.headers['user-agent'];
  return {
    ip: request.ip ?? null,
    userAgent: typeof userAgent === 'string' ? userAgent.slice(0, 255) : null,
  };
}
