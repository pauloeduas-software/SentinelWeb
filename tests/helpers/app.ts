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
  /**
   * Uma sessão com o PAPEL pedido (D148).
   *
   * É o que permite testar o que o administrador nunca vê: o cliente padrão é
   * `ADMIN` e alcança tudo, então nenhuma asserção sobre "sem acesso" é possível
   * por ele.
   *
   * Cria um colaborador com senha, define o papel e entra. `USUARIO` (o padrão) é
   * o caso mais útil: é a sessão que entrou e não alcança nada — a que prova que
   * a porta está fechada por padrão.
   */
  comoUsuario(papel?: 'USUARIO' | 'TECNICO' | 'ADMIN'): Promise<Cliente & { userId: string }>;
  /** A instância montada, para o que o cliente não cobre (WebSocket, `app.hasRoute`). */
  app: FastifyInstance;
  /** O id do administrador logado — o ator esperado em todo `ActivityLog`. */
  adminId: string;
  /**
   * O cabeçalho `cookie` da sessão, para o que precisa de `app.inject()` cru.
   *
   * QUEM PRECISA DISSO: upload. O cliente acima manda JSON, e um corpo
   * `multipart/form-data` é um `Buffer` com `content-type` próprio — então ele
   * vai pelo `inject`, que não carrega cookie sozinho. Antes desta linha, cada
   * arquivo de teste que subia arquivo fazia um SEGUNDO login para descobrir o
   * cookie que o `criarApi` já tinha na mão.
   */
  cookie: string;
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
 * Um cliente com UM cookie de sessão específico.
 *
 * QUEM PRECISA DISSO: o arquivo que faz login mais de uma vez na mesma conta — o
 * do segundo fator (F11, Etapa H), em que a MESMA pessoa entra sem código, com
 * código errado, com código certo e com código de recuperação. O `criarApi()`
 * guarda um cookie só (o do administrador) e o `comoUsuario()` devolve um cliente
 * já logado sem as credenciais, então nenhum dos dois serve para reentrar.
 *
 * Recebe o VALOR do cookie (o que vem de `resposta.cookies`), não o cabeçalho
 * montado: quem chama acabou de ler a resposta do login e não tem por que
 * conhecer o nome do cookie.
 *
 * Para autenticar por TOKEN pessoal não há função nenhuma — é `api.anonimo` com
 * `{ headers: { authorization: 'Bearer …' } }`. O cabeçalho já é por requisição,
 * e um cliente próprio só esconderia que ali não há sessão.
 */
export function clienteComSessao(app: FastifyInstance, valorDoCookie: string): Cliente {
  return clienteCom(app, `${COOKIE_SESSAO}=${valorDoCookie}`);
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

  const cookie = `${COOKIE_SESSAO}=${token}`;

  const padrao = clienteCom(app, cookie);

  /**
   * A sessão com um PAPEL, montada PELA API — nunca por escrita direta no banco.
   *
   * Pelas rotas (`POST /api/users`, `PUT /api/users/:id`,
   * `POST /api/users/:id/set-password`) porque é o mesmo motivo que este arquivo
   * inteiro existe: um teste que gravasse `role` com `prisma.user.update` pularia
   * o zod da borda e passaria a verde com um valor que a aplicação recusaria.
   *
   * ERA `comoUsuario(permissoes: string[])`, com grupo (D76). O D148 trocou a
   * matriz pelo papel, e o grupo intermediário desapareceu junto.
   */
  async function comoUsuario(papel: 'USUARIO' | 'TECNICO' | 'ADMIN' = 'USUARIO') {
    // `Date.now()` no sufixo porque `email` e `name` são únicos por índice
    // parcial, e um arquivo de teste chama isto mais de uma vez.
    const marca = `p${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const senha = 'Senha-De-Teste-123';

    const pessoa = await padrao.post<{ id: string }>('/api/users', {
      name: `Sessão ${marca}`,
      email: `${marca}@teste.local`,
    });
    if (pessoa.status !== 201 && pessoa.status !== 200) {
      throw new Error(`comoUsuario: criar pessoa falhou (${pessoa.status}): ${JSON.stringify(pessoa.body)}`);
    }

    // `USUARIO` é o padrão da coluna: só chama a rota quando há o que mudar.
    if (papel !== 'USUARIO') {
      const promocao = await padrao.put(`/api/users/${pessoa.body.id}`, { role: papel });
      if (promocao.status !== 200) {
        throw new Error(`comoUsuario: definir papel falhou (${promocao.status}): ${JSON.stringify(promocao.body)}`);
      }
    }

    const credencial = await padrao.post(`/api/users/${pessoa.body.id}/set-password`, {
      username: marca,
      password: senha,
    });
    if (credencial.status !== 200 && credencial.status !== 204) {
      throw new Error(`comoUsuario: dar senha falhou (${credencial.status}): ${JSON.stringify(credencial.body)}`);
    }

    const entrada = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: marca, password: senha },
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
    cookie,
    ...padrao,
    comoUsuario,
    anonimo: clienteCom(app, null),
    fechar: () => app.close(),
  };
}
