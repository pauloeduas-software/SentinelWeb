import { randomUUID } from 'crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';

// Um log por requisição, com `reqId` (também devolvido em X-Request-Id, para
// casar reclamação do usuário com o log). O log automático do Fastify fica
// desligado (`disableRequestLogging` no app.ts) porque são DUAS linhas por
// requisição — com o painel consultando a cada 5s, o log vira ruído.
//
// Corpo de requisição NUNCA é logado. A query string sai da URL
// (`caminhoSemQuery`, abaixo).

// Gera/reaproveita o id da requisição. Um id vindo de fora só é aceito no
// formato esperado — senão qualquer cliente injetaria texto no log.
export function generateRequestId(req: { headers: Record<string, unknown> }): string {
  const incoming = req.headers['x-request-id'];
  return typeof incoming === 'string' && /^[\w-]{8,64}$/.test(incoming) ? incoming : randomUUID();
}

// Requisição que só faria ruído: health check e arquivo estático (GET fora da API)
function isNoise(request: FastifyRequest): boolean {
  return request.method === 'GET' && !request.url.startsWith('/api');
}

// A QUERY STRING NÃO ENTRA NO LOG.
//
// Hoje nenhuma rota carrega credencial no caminho — a única que carregava era a
// do termo de entrega, que saiu —, então não há segmento a mascarar. O que
// sobrou é cortar o `?`: `sanitize.ts` cuida do CORPO, e uma busca colada na URL
// não precisa virar linha de log.
function caminhoSemQuery(url: string): string {
  return url.split('?')[0];
}

export function registerRequestLogger(server: FastifyInstance): void {
  server.addHook('onSend', async (request, reply, payload) => {
    reply.header('X-Request-Id', request.id);
    return payload;
  });

  server.addHook('onResponse', async (request, reply) => {
    if (isNoise(request)) return;
    const line = {
      reqId: request.id,
      method: request.method,
      url: caminhoSemQuery(request.url),
      statusCode: reply.statusCode,
      responseTime: Math.round(reply.elapsedTime),
    };
    if (reply.statusCode >= 500) request.log.error(line, 'request failed');
    else if (reply.statusCode >= 400) request.log.warn(line, 'request rejected');
    else request.log.info(line, 'request completed');
  });
}
