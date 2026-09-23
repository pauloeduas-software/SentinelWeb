import '../config/load-env';
import pino from 'pino';
import { sanitizeError, sanitizeForLog } from './sanitize';

// Log estruturado (JSON em produção, legível em desenvolvimento). Tudo que vai
// para o log passa pela limpeza de `sanitize.ts`, num lugar só. Esta mesma
// instância é entregue ao Fastify (`loggerInstance`), então o log de requisição
// e o log da aplicação saem com o mesmo formato e o mesmo destino.
const isProduction = process.env.NODE_ENV === 'production';

export const rootLogger = pino({
  level: process.env.LOG_LEVEL || 'info',
  // Erro passado a QUALQUER log sai resumido: sem headers, sem corpo, sem os
  // dados da consulta do Prisma
  serializers: { err: sanitizeError },
  // Segunda camada, caso algum log passe headers crus
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
    censor: '[oculto]',
  },
  ...(isProduction
    ? {}
    : {
        // Dev: uma linha por log. O `context` sai da tela porque a mensagem já
        // traz o prefixo ([Server], [Job]...); no JSON de produção ele continua.
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname,context', singleLine: true },
        },
      }),
});

export interface Logger {
  debug: (message: string, ...details: unknown[]) => void;
  info: (message: string, ...details: unknown[]) => void;
  warn: (message: string, ...details: unknown[]) => void;
  error: (message: string, ...details: unknown[]) => void;
}

// Mesma forma de chamar do console (`mensagem, ...detalhes`), saída estruturada:
// o primeiro Error vira `err` (os demais, `errors`), um objeto simples entra como
// campos do log e o resto vai em `details` — tudo já limpo.
function split(details: unknown[]): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  const errors: Error[] = [];
  const rest: unknown[] = [];
  for (const detail of details) {
    if (detail instanceof Error) errors.push(detail);
    else if (
      detail &&
      typeof detail === 'object' &&
      !Array.isArray(detail) &&
      Object.getPrototypeOf(detail) === Object.prototype
    ) {
      Object.assign(fields, sanitizeForLog(detail) as Record<string, unknown>);
    } else if (detail !== undefined) rest.push(sanitizeForLog(detail));
  }
  if (errors.length > 0) fields.err = errors[0]; // limpo pelo serializer `err`
  if (errors.length > 1) fields.errors = errors.slice(1).map(e => sanitizeError(e));
  if (rest.length > 0) fields.details = rest.length === 1 ? rest[0] : rest;
  return fields;
}

// `context`: de onde vem o log (ex.: 'agent.maestro'). Campos fixos extras
// (hwid, jobId...) entram com o segundo parâmetro.
export function createLogger(context: string, bindings: Record<string, unknown> = {}): Logger {
  const child = rootLogger.child({ context, ...bindings });
  return {
    debug: (message, ...details) => child.debug(split(details), message),
    info: (message, ...details) => child.info(split(details), message),
    warn: (message, ...details) => child.warn(split(details), message),
    error: (message, ...details) => child.error(split(details), message),
  };
}
