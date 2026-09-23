import type { FastifyInstance, FastifyRequest } from 'fastify';
import { createLogger } from '../logger/logger';

// A porta fechada por padrão: TODA rota exige sessão, e a exceção é escrita à
// mão (docs/FASE-3-PLANO-ITAM.md, Etapa C).
//
// POR QUE UM HOOK GLOBAL, E NÃO UM `preHandler` POR ROTA: com a proteção por
// rota, a rota nova nasce ABERTA — e esquecer de protegê-la não gera erro
// nenhum, só uma API pública que ninguém notou. Invertendo, o esquecimento vira
// "a rota nova pede login", que aparece no primeiro teste.
//
// POR QUE A ALLOWLIST VEM POR PARÂMETRO: saber que `/agent-hub` tem
// autenticação própria e que `/aceite/:token` (F4) é público é conhecimento de
// NEGÓCIO, e `server/core` não pode importar `server/domain`
// (eslint.config.js). É a mesma inversão do `sortable` do `parseListQuery`.
//
// O mesmo vale para `autenticar`: o que é uma sessão — JWT, cookie, usuário no
// banco — é do domínio `auth`. Aqui só mora a ORDEM: casou com a allowlist,
// passa; não casou, tem que autenticar.

const logger = createLogger('require-auth');

export interface RotaPublica {
  /** Método HTTP exato. `*` aceita qualquer um. */
  method: string;
  /** Caminho exato, sem query string. Sufixo `/*` casa o prefixo. */
  path: string;
  /** Por que esta rota dispensa sessão — vai para o log do boot. */
  motivo: string;
}

export interface AuthGuardOptions {
  rotasPublicas: readonly RotaPublica[];

  /**
   * O painel estático (index.html, /assets/*) é público.
   *
   * Vale só em produção, onde o Fastify serve o `dist`: o HTML precisa carregar
   * para a tela de login existir, e o bundle que ele baixa é código público de
   * qualquer forma.
   *
   * Cobre GET fora de `/api`, e o limite é esse: a API inteira continua fechada.
   * Rota nova de painel (não-API) que precise de sessão não pode ser um GET solto
   * — o que existe fora de `/api` hoje é `/health`, `/agent-hub` (com o token
   * próprio dele) e arquivo estático.
   */
  estaticoPublico: boolean;

  /**
   * Estabelece a sessão na requisição. LANÇA quando não houver sessão válida
   * (o `AppError` do domínio vira 401 no error-handler, como qualquer outro).
   */
  autenticar: (request: FastifyRequest) => Promise<void>;
}

function casa(rota: RotaPublica, method: string, path: string): boolean {
  if (rota.method !== '*' && rota.method !== method) return false;
  if (rota.path.endsWith('/*')) return path.startsWith(rota.path.slice(0, -1));
  return rota.path === path;
}

export function registerAuthGuard(server: FastifyInstance, options: AuthGuardOptions): void {
  const { rotasPublicas, estaticoPublico, autenticar } = options;

  server.addHook('preHandler', async (request) => {
    // `request.url` traz a query string; a allowlist compara só o caminho —
    // senão `/health?x=1` deixaria de ser público.
    const path = request.url.split('?')[0];

    if (rotasPublicas.some((rota) => casa(rota, request.method, path))) return;

    if (estaticoPublico && request.method === 'GET' && !path.startsWith('/api')) return;

    await autenticar(request);
  });

  for (const rota of rotasPublicas) {
    logger.info(`[Auth] Público: ${rota.method} ${rota.path} — ${rota.motivo}`);
  }
  if (estaticoPublico) {
    logger.info('[Auth] Público: GET fora de /api — painel estático (o HTML carrega a tela de login).');
  }
  logger.info('[Auth] Todo o resto exige sessão.');
}
