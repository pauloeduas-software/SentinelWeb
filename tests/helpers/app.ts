import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../server/app';
import { COOKIE_SESSAO } from '../../server/domain/auth/helpers/session-cookie.helper';

// O CLIENTE DE TESTE — requisições em memória contra a aplicação de verdade.
//
// `app.inject()` monta a requisição e a entrega ao Fastify sem passar por
// socket: sem porta, sem espera de boot, sem `curl`. O que ela exercita é o
// mesmo grafo de produção — os plugins na mesma ordem, o `preHandler` global
// que fecha a API, o error-handler que monta todo 4xx.
//
// O QUE ESTE ARQUIVO EXISTE PARA IMPEDIR: que um teste chame o use-case direto.
// Foi assim que o defeito 1 da auditoria passou — verificado pelo caminho da
// API, nunca pelo do formulário. Um use-case chamado direto pula o zod da
// borda, o `strictObject` que recusa campo desconhecido, a sessão e o
// error-handler; ou seja, pula quase tudo que erra na prática. Aqui só se fala
// HTTP.

/** Resposta já com o corpo desempacotado — que é o que a asserção quer ver. */
export interface Resposta<T = unknown> {
  status: number;
  body: T;
  headers: Record<string, unknown>;
}

interface Opcoes {
  /** Sobrescreve/acrescenta cabeçalhos (o `Authorization` do `/agent-hub`, por exemplo). */
  headers?: Record<string, string>;
}

export interface Cliente {
  get<T = unknown>(url: string, opcoes?: Opcoes): Promise<Resposta<T>>;
  post<T = unknown>(url: string, body?: unknown, opcoes?: Opcoes): Promise<Resposta<T>>;
  patch<T = unknown>(url: string, body?: unknown, opcoes?: Opcoes): Promise<Resposta<T>>;
  put<T = unknown>(url: string, body?: unknown, opcoes?: Opcoes): Promise<Resposta<T>>;
  delete<T = unknown>(url: string, body?: unknown, opcoes?: Opcoes): Promise<Resposta<T>>;
}

export interface ApiDeTeste extends Cliente {
  /** A instância montada, para o que o cliente não cobre (WebSocket, `app.hasRoute`). */
  app: FastifyInstance;
  /** O id do administrador logado — o ator esperado em todo `ActivityLog`. */
  adminId: string;
  /** O MESMO app, sem o cookie de sessão: é com ele que se testa a porta fechada. */
  anonimo: Cliente;
  fechar(): Promise<void>;
}

const ADMIN_USERNAME = process.env.ADMIN_USERNAME ?? 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? '';

function desempacotar<T>(bruto: { statusCode: number; body: string; headers: Record<string, unknown> }): Resposta<T> {
  // Corpo vazio é legítimo (204, e alguns 4xx do plugin de rate limit). Um
  // `JSON.parse('')` aqui viraria "Unexpected end of JSON input" no lugar do
  // status que a asserção queria ver — erro sobre o erro.
  let body: unknown = null;
  if (bruto.body !== '') {
    try {
      body = JSON.parse(bruto.body);
    } catch {
      body = bruto.body;
    }
  }
  return { status: bruto.statusCode, body: body as T, headers: bruto.headers };
}

function clienteCom(app: FastifyInstance, cookie: string | null): Cliente {
  async function pedir<T>(
    method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
    url: string,
    body?: unknown,
    opcoes?: Opcoes,
  ): Promise<Resposta<T>> {
    const headers: Record<string, string> = { ...(opcoes?.headers ?? {}) };
    if (cookie) headers.cookie = cookie;

    const resposta = await app.inject({
      method,
      url,
      headers,
      // `payload: undefined` e `payload: {}` são coisas diferentes: o primeiro
      // manda corpo VAZIO, e é isso que prova que o zod recusa `{}` obrigatório.
      ...(body === undefined ? {} : { payload: body as object }),
    });

    return desempacotar<T>(resposta);
  }

  return {
    get: (url, opcoes) => pedir('GET', url, undefined, opcoes),
    post: (url, body, opcoes) => pedir('POST', url, body, opcoes),
    patch: (url, body, opcoes) => pedir('PATCH', url, body, opcoes),
    put: (url, body, opcoes) => pedir('PUT', url, body, opcoes),
    delete: (url, body, opcoes) => pedir('DELETE', url, body, opcoes),
  };
}

/**
 * Monta a aplicação e entra como o administrador do seed.
 *
 * Uma por arquivo de teste, em `beforeAll`. Por arquivo, e não global, porque
 * o teto do `@fastify/rate-limit` é contado em memória POR INSTÂNCIA: com uma
 * instância para a suíte inteira, o arquivo de número quinze começaria a tomar
 * 429 por causa das requisições dos catorze anteriores — uma falha que muda de
 * lugar conforme a ordem dos arquivos.
 */
export async function criarApi(): Promise<ApiDeTeste> {
  const app = await buildApp();

  const login = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { username: ADMIN_USERNAME, password: ADMIN_PASSWORD },
  });

  if (login.statusCode !== 200) {
    throw new Error(
      `Login do administrador falhou no harness (${login.statusCode}): ${login.body}\n` +
        'O seed cria a conta com ADMIN_PASSWORD do .env.test — confira se os dois batem.',
    );
  }

  const token = login.cookies.find((c) => c.name === COOKIE_SESSAO)?.value;
  if (!token) throw new Error(`Login respondeu 200 sem gravar o cookie ${COOKIE_SESSAO}.`);

  const { id: adminId } = JSON.parse(login.body) as { id: string };

  return {
    app,
    adminId,
    ...clienteCom(app, `${COOKIE_SESSAO}=${token}`),
    anonimo: clienteCom(app, null),
    fechar: () => app.close(),
  };
}
