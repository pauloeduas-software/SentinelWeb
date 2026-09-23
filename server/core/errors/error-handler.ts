import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { AppError } from './app-error';
import { formatZodError } from './zod-error';
import { errorCode, errorProp } from './error-shape';
import { createLogger } from '../logger/logger';

const logger = createLogger('error-handler');

const DEFAULT_MESSAGE = 'Erro interno do servidor';

export interface HttpError {
  status: number;
  body: Record<string, unknown>;
  unexpected: boolean;
}

// Traduz qualquer erro em resposta HTTP. Ponto ÚNICO do sistema: os use-cases
// lançam `AppError` com o status certo e ninguém monta resposta de erro na mão.
// Erro inesperado vira 500 com mensagem genérica — `error.message` de banco ou
// de biblioteca NUNCA vai para o cliente (só para o log).
export function toHttpError(error: unknown, fallbackMessage = DEFAULT_MESSAGE): HttpError {
  if (error instanceof AppError) {
    return {
      status: error.status,
      body: { error: error.message, ...(error.details ?? {}) },
      unexpected: error.status >= 500,
    };
  }

  // Payload recusado pelo schema do domínio: 422 com o campo que falhou.
  // Os controllers só chamam `schema.parse()`; a rejeição cai aqui sozinha.
  if (error instanceof ZodError) {
    return { status: 422, body: { ...formatZodError(error) }, unexpected: false };
  }

  const code = errorCode(error);

  // Prisma: registro inexistente / violação de UNIQUE / chave estrangeira
  if (code === 'P2025') return { status: 404, body: { error: 'Registro não encontrado' }, unexpected: false };
  if (code === 'P2002') return { status: 409, body: { error: 'Registro já existe' }, unexpected: false };
  if (code === 'P2003') return { status: 409, body: { error: 'Registro está em uso por outro cadastro' }, unexpected: false };

  // Fastify: schema recusado, corpo grande demais, JSON malformado
  if (errorProp(error, 'validation')) return { status: 400, body: { error: 'Requisição inválida' }, unexpected: false };
  if (code === 'FST_ERR_CTP_BODY_TOO_LARGE') return { status: 413, body: { error: 'Requisição grande demais' }, unexpected: false };
  if (code?.startsWith('FST_ERR_CTP_')) {
    return { status: 400, body: { error: 'Requisição inválida' }, unexpected: false };
  }

  const statusCode = errorProp(error, 'statusCode');

  // @fastify/rate-limit lança o 429 em vez de responder direto. Sem este caso
  // ele cairia no 4xx genérico e o cliente leria "Requisição inválida" — que não
  // diz o que fazer. A mensagem é NOSSA: texto de biblioteca não vai ao cliente.
  if (statusCode === 429) {
    return {
      status: 429,
      body: { error: 'Muitas requisições. Tente novamente em instantes.' },
      unexpected: false,
    };
  }

  // Erro que já carrega status HTTP próprio (4xx do próprio Fastify)
  if (typeof statusCode === 'number' && statusCode >= 400 && statusCode < 500) {
    return { status: statusCode, body: { error: 'Requisição inválida' }, unexpected: false };
  }

  return { status: 500, body: { error: fallbackMessage }, unexpected: true };
}

// Último tratamento do Fastify: handler async que rejeita cai aqui sozinho,
// então NENHUM controller precisa de try/catch.
export function registerErrorHandler(server: FastifyInstance): void {
  server.setErrorHandler((error, request: FastifyRequest, reply: FastifyReply) => {
    const { status, body, unexpected } = toHttpError(error);
    if (unexpected) {
      logger.error(`[${request.method} ${request.url.split('?')[0]}] Erro inesperado:`, error);
    }
    reply.status(status).send(body);
  });

  // Rota inexistente responde JSON no mesmo formato de erro do resto da API
  server.setNotFoundHandler((request, reply) => {
    reply.status(404).send({ error: `Rota não encontrada: ${request.method} ${request.url.split('?')[0]}` });
  });
}
