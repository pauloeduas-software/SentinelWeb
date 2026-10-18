import type { FastifyInstance } from 'fastify';
import { buildApp, type OpcoesDaAplicacao } from '../../server/app';
import { COOKIE_SESSAO } from '../../server/domain/auth/helpers/session-cookie.helper';
import { ADMIN_DE_TESTE } from '../setup/database';

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
  /** Sobrescreve/acrescenta cabeçalhos (um `origin` de outro site, por exemplo). */
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
  /**
   * Uma sessão com o CARGO pedido (D148).
   *
   * É o que permite testar o que o administrador nunca vê: o cliente padrão é
   * `ADMIN` e alcança tudo, então nenhuma asserção sobre "sem acesso" é possível
   * por ele.
   *
   * Cria um colaborador com senha, define o cargo e entra. `TECNICO` é o padrão
   * porque `USUARIO` NÃO ENTRA: o login o recusa com 403, e é isso que
   * `tests/invariantes/permissao.test.ts` prova.
   */
  comoUsuario(cargo?: 'TECNICO' | 'ADMIN'): Promise<Cliente & { userId: string }>;
  /** A instância montada, para o que o cliente não cobre (WebSocket, `app.hasRoute`). */
  app: FastifyInstance;
  /** O id do administrador logado — o ator esperado em todo `ActivityLog`. */
  adminId: string;
  /** O MESMO app, sem o cookie de sessão: é com ele que se testa a porta fechada. */
  anonimo: Cliente;
  fechar(): Promise<void>;
}


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
 * Uma por arquivo de teste, em `beforeAll` — com uma exceção, que é o teste do
 * teto: ele monta DUAS, uma de cada montagem, porque o que ele prova é a
 * diferença entre as duas.
 *
 * O MOTIVO DISSO MUDOU, e vale registrar porque ele governava o tamanho dos
 * arquivos: era o teto do `@fastify/rate-limit`, contado em memória POR
 * INSTÂNCIA — com uma instância para a suíte inteira, o arquivo de número quinze
 * tomava 429 por causa das requisições dos catorze anteriores. O limitador agora
 * não é registrado no teste (`server/app.ts`, `comTetoDeRequisicao`), e o
 * contador deixou de existir: nenhum arquivo precisa mais ser dividido para
 * caber nele.
 *
 * Uma por arquivo continua sendo o certo, por outra razão: cada arquivo abre e
 * FECHA a sua (`fechar()`), e uma instância compartilhada teria que sobreviver
 * ao `afterAll` de todos eles. É arranjo de isolamento, não mais de aritmética.
 *
 * `opcoes` vai direto ao `buildApp`. Hoje quem passa algo é um teste só — o do
 * teto, que precisa do limitador LIGADO para poder prová-lo.
 */
export async function criarApi(opcoes: OpcoesDaAplicacao = {}): Promise<ApiDeTeste> {
  const app = await buildApp(opcoes);

  const login = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: ADMIN_DE_TESTE,
  });

  if (login.statusCode !== 200) {
    throw new Error(
      `Login do administrador falhou no harness (${login.statusCode}): ${login.body}\n` +
        'O harness cria a conta em tests/setup/database.ts (ADMIN_DE_TESTE) — confira o ADMIN_PASSWORD do .env.test.',
    );
  }

  const token = login.cookies.find((c) => c.name === COOKIE_SESSAO)?.value;
  if (!token) throw new Error(`Login respondeu 200 sem gravar o cookie ${COOKIE_SESSAO}.`);

  const { id: adminId } = JSON.parse(login.body) as { id: string };

  const cookie = `${COOKIE_SESSAO}=${token}`;

  const padrao = clienteCom(app, cookie);

  /**
   * A sessão com um CARGO, montada PELA API — nunca por escrita direta no banco.
   *
   * Pela rota (`POST /api/users`, com cargo e senha no mesmo corpo) porque é o
   * mesmo motivo que este arquivo
   * inteiro existe: um teste que gravasse `role` com `prisma.user.update` pularia
   * o zod da borda e passaria a verde com um valor que a aplicação recusaria.
   *
   * ERA `comoUsuario(permissoes: string[])`, com grupo (D76). O D148 trocou a
   * matriz pelo cargo, e o grupo intermediário desapareceu junto.
   */
  async function comoUsuario(cargo: 'TECNICO' | 'ADMIN' = 'TECNICO') {
    // `Date.now()` no sufixo porque o `email` é único por índice parcial, e um
    // arquivo de teste chama isto mais de uma vez.
    const marca = `p${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const email = `${marca}@teste.local`;
    const senha = 'Senha-De-Teste-123';

    const pessoa = await padrao.post<{ id: string }>('/api/users', {
      name: `Sessão ${marca}`,
      email,
      role: cargo,
      password: senha,
    });
    if (pessoa.status !== 201) {
      throw new Error(`comoUsuario: criar pessoa falhou (${pessoa.status}): ${JSON.stringify(pessoa.body)}`);
    }

    const entrada = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email, password: senha },
    });
    if (entrada.statusCode !== 200) {
      throw new Error(`comoUsuario: login falhou (${entrada.statusCode}): ${entrada.body}`);
    }

    const sessao = entrada.cookies.find((c) => c.name === COOKIE_SESSAO)?.value;
    if (!sessao) throw new Error('comoUsuario: login sem cookie de sessão.');

    return { ...clienteCom(app, `${COOKIE_SESSAO}=${sessao}`), userId: pessoa.body.id };
  }

  return {
    app,
    adminId,
    ...padrao,
    comoUsuario,
    anonimo: clienteCom(app, null),
    fechar: () => app.close(),
  };
}
