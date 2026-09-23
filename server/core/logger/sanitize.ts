// Limpeza de tudo que vai para o log. Regra: o log nunca carrega credencial
// (senha, token, chave, cookie) nem despeja objeto inteiro, em qualquer nível.

// Nome de campo que indica credencial: o valor vira "[oculto]", em qualquer
// profundidade (não depende de listar o caminho exato de cada campo).
const SENSITIVE_KEY = /senha|password|passwd|token|secret|segredo|apikey|api_key|authorization|cookie|jwt/i;
const MAX_DEPTH = 6;
const MAX_STRING = 1000; // payload de handshake traz a lista de software instalado
const MAX_ITEMS = 20;

const truncate = (value: string, max = MAX_STRING) =>
  value.length > max ? `${value.slice(0, max)}… (+${value.length - max} caracteres)` : value;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

// Só as linhas "at ..." da pilha: a primeira linha repete a MENSAGEM do erro,
// que no Prisma pode trazer os dados da consulta (hwid, hostname, payload).
const stackFrames = (stack: unknown) =>
  typeof stack === 'string'
    ? stack.split('\n').filter(line => line.trimStart().startsWith('at ')).slice(0, 15).join('\n')
    : undefined;

export function sanitizeError(error: unknown, depth = 0): Record<string, unknown> {
  // O que chega aqui é `unknown`: objeto de erro, string, qualquer coisa.
  const err: Record<string, unknown> =
    typeof error === 'object' && error !== null ? (error as Record<string, unknown>) : {};

  const out: Record<string, unknown> = {
    type: typeof err.name === 'string' ? err.name : 'Error',
    // `?? error` cobre o caso de terem lançado algo que não é objeto
    message: truncate(String(err.message ?? error), 500),
  };

  if (err.code !== undefined) out.code = err.code;

  if (typeof err.name === 'string' && err.name.startsWith('PrismaClient')) {
    // A mensagem do Prisma mostra a chamada com os DADOS; a última linha é o motivo
    const lines = String(err.message ?? '').split('\n').map(line => line.trim()).filter(Boolean);
    out.message = truncate(lines[lines.length - 1] ?? 'Erro do Prisma', 300);
    if (err.meta) out.meta = sanitizeForLog(err.meta, depth + 1);
  }

  if (err.status !== undefined) out.status = err.status;
  out.stack = stackFrames(err.stack);
  if (err.cause && depth < 3) out.cause = sanitizeError(err.cause, depth + 1);
  return out;
}

export function sanitizeForLog(value: unknown, depth = 0): unknown {
  if (value instanceof Error) return sanitizeError(value, depth);
  if (typeof value === 'string') return truncate(value);
  if (typeof value === 'bigint') return value.toString();
  if (value === null || typeof value !== 'object') return value;
  if (depth >= MAX_DEPTH) return '[...]';
  if (Buffer.isBuffer(value)) return `[Buffer ${value.length} bytes]`;
  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_ITEMS).map(item => sanitizeForLog(item, depth + 1));
    return value.length > MAX_ITEMS ? [...items, `… (+${value.length - MAX_ITEMS} itens)`] : items;
  }
  if (value instanceof Date) return value.toISOString();
  if (!isPlainObject(value)) {
    // Instância de classe (socket, request, cliente Prisma...): não despeja o objeto inteiro
    return `[${(value as object).constructor?.name ?? 'Object'}]`;
  }
  const out: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value)) {
    out[key] = SENSITIVE_KEY.test(key) ? '[oculto]' : sanitizeForLog(inner, depth + 1);
  }
  return out;
}
