import { randomUUID } from 'crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';

// Um log por requisição, com `reqId` (também devolvido em X-Request-Id, para
// casar reclamação do usuário com o log). O log automático do Fastify fica
// desligado (`disableRequestLogging` no server.ts) porque são DUAS linhas por
// requisição — com o painel consultando a cada 5s, o log vira ruído.
//
// Corpo de requisição NUNCA é logado. A query string sai da URL: pode carregar
// token quando o agente passar a se autenticar.

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

// CAMINHOS QUE CARREGAM CREDENCIAL, e o segmento em que ela está.
//
// `sanitize.ts` já remove campo sensível do CORPO, mas o token do termo de
// entrega viaja na URL — `/aceite/<32 bytes>/aceitar` — e a URL é exatamente o
// que esta função grava. Sem o mascaramento, o `X-Request-Id` sairia no log
// acompanhado da credencial que ele deveria ajudar a rastrear, e qualquer
// pessoa com acesso ao log poderia assinar um termo em nome de outra.
//
// O prefixo fica legível (dá para achar a requisição); o segredo, não.
const CAMINHOS_COM_SEGREDO = [{ prefixo: '/api/aceite/', segmento: 3 }];

function mascararCaminho(url: string): string {
  const caminho = url.split('?')[0];
  const regra = CAMINHOS_COM_SEGREDO.find((r) => caminho.startsWith(r.prefixo));
  if (!regra) return caminho;

  const partes = caminho.split('/');
  if (partes.length <= regra.segmento) return caminho;

  partes[regra.segmento] = '***';
  return partes.join('/');
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
      url: mascararCaminho(request.url),
      statusCode: reply.statusCode,
      responseTime: Math.round(reply.elapsedTime),
    };
    if (reply.statusCode >= 500) request.log.error(line, 'request failed');
    else if (reply.statusCode >= 400) request.log.warn(line, 'request rejected');
    else request.log.info(line, 'request completed');
  });
}
