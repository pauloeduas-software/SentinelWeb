import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CONTRATO } from '../../server/modules/api-docs/helpers/contrato-das-rotas';
import { ROTAS_POR_PERMISSAO } from '../../server/modules/access/helpers/route-permissions';
import { criarApi, type ApiDeTeste } from '../helpers/app';

// O SWAGGER E O CONTRATO DA API (AS).
//
// A tabela `método + rota → o que faz` (`api-docs/helpers/contrato-das-rotas.ts`)
// tem a mesma disciplina do mapa de permissões: rota nova sem linha reprova aqui,
// então a documentação não envelhece. E o que o Swagger mostra sai do mesmo schema
// que o controller valida — este arquivo prova que ele de fato sai.

let api: ApiDeTeste;

beforeAll(async () => {
  api = await criarApi();
});

afterAll(async () => {
  await api.fechar();
});

interface Openapi {
  paths: Record<string, Record<string, {
    summary?: string;
    tags?: string[];
    requestBody?: { content: { 'application/json': { schema: { properties?: Record<string, unknown>; required?: string[] } } } };
    parameters?: { name: string; in: string }[];
    responses: Record<string, unknown>;
    security?: unknown[];
  }>>;
  components: { securitySchemes: Record<string, unknown> };
}

async function lerContrato(): Promise<Openapi> {
  const resposta = await api.anonimo.get<Openapi>('/api/docs/json');
  expect(resposta.status).toBe(200);
  return resposta.body;
}

// `/api/users/:id` do Fastify é `/api/users/{id}` no OpenAPI.
const paraOpenapi = (url: string) => url.replace(/:([A-Za-z]+)/g, '{$1}');

describe('o contrato cobre a API inteira', () => {
  it('toda rota da API tem linha no contrato, e nenhuma linha sobra', () => {
    // As rotas da API são as do mapa de permissões — a lista que o boot confere —,
    // mais o login, que é público e por isso fica fora dele.
    const rotasDaApi = [...Object.keys(ROTAS_POR_PERMISSAO), 'POST /api/auth/login'];
    expect(Object.keys(CONTRATO).sort()).toEqual(rotasDaApi.sort());
  });

  it('o Swagger publica cada rota do contrato, com resumo e tag', async () => {
    const { paths } = await lerContrato();
    for (const [chave, contrato] of Object.entries(CONTRATO)) {
      const [metodo, url] = chave.split(' ');
      const operacao = paths[paraOpenapi(url)]?.[metodo.toLowerCase()];
      expect(operacao, chave).toBeDefined();
      expect(operacao.summary, chave).toBe(contrato.resumo);
      expect(operacao.tags, chave).toEqual([contrato.tag]);
    }
  });

  it('não publica nada que não esteja no contrato: nem /health, nem o agente, nem o próprio Swagger', async () => {
    const { paths } = await lerContrato();
    const publicadas = Object.entries(paths).flatMap(([url, ops]) => Object.keys(ops).map((m) => `${m.toUpperCase()} ${url}`));
    const doContrato = new Set(Object.keys(CONTRATO).map((c) => paraOpenapi(c)));
    expect(publicadas.filter((p) => !doContrato.has(p))).toEqual([]);
  });
});

describe('o corpo vem do schema que o controller valida', () => {
  it('o login mostra e-mail e senha, e não pede sessão', async () => {
    const { paths } = await lerContrato();
    const login = paths['/api/auth/login'].post;
    const corpo = login.requestBody!.content['application/json'].schema;
    expect(Object.keys(corpo.properties ?? {})).toEqual(['email', 'password']);
    expect(login.security).toEqual([]);
  });

  it('a troca da própria senha mostra a atual e a nova', async () => {
    const { paths } = await lerContrato();
    const corpo = paths['/api/auth/password'].put.requestBody!.content['application/json'].schema;
    expect(Object.keys(corpo.properties ?? {})).toEqual(['currentPassword', 'newPassword']);
    // A atual é opcional no contrato: a troca obrigatória não a pede (AU).
    expect(corpo.required).toEqual(['newPassword']);
  });

  it('o parâmetro do caminho aparece, e o cookie de sessão é o esquema de segurança', async () => {
    const contrato = await lerContrato();
    const parametros = contrato.paths['/api/users/{id}'].put.parameters ?? [];
    expect(parametros.some((p) => p.name === 'id' && p.in === 'path')).toBe(true);
    expect(contrato.components.securitySchemes).toHaveProperty('sessao');
  });

  it('as tabelas de catálogo saem com o corpo da spec de cada uma', async () => {
    const { paths } = await lerContrato();
    const corpo = paths['/api/manufacturers'].post.requestBody!.content['application/json'].schema;
    expect(Object.keys(corpo.properties ?? {})).toContain('name');
  });
});

describe('o Swagger é só de fora de produção', () => {
  it('a interface abre sem sessão', async () => {
    const resposta = await api.app.inject({ method: 'GET', url: '/api/docs' });
    expect([200, 302]).toContain(resposta.statusCode);
  });
});
