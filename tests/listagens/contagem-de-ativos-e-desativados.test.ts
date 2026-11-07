import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import { criarColaborador, criarItemDeEstoque, idsDoSeed } from '../helpers/fixtures';

// OS CARTÕES DE ESTOQUE, COLABORADORES E USUÁRIOS (BT, CA) — `GET /api/stock/items/stats`,
// `GET /api/people/stats`, `GET /api/users/stats` e o `?isActive=` das três listas.
//
// Cada linha cai em um cartão só, e o número do cartão é o total da lista que ele abre.

interface Stats {
  total: number;
  ativos: number;
  desativados: number;
}

interface Envelope {
  rows: { id: string; name: string }[];
  total: number;
}

let api: ApiDeTeste;

beforeAll(async () => {
  api = await criarApi();
  const seed = await idsDoSeed();

  await criarItemDeEstoque(api, { name: 'Item ativo 1', categoryId: seed.categoriaEstoqueId, qty: 5 });
  await criarItemDeEstoque(api, { name: 'Item ativo 2', categoryId: seed.categoriaEstoqueId, qty: 5 });
  const parado = await criarItemDeEstoque(api, { name: 'Item desativado', categoryId: seed.categoriaEstoqueId, qty: 5 });
  expect((await api.put(`/api/stock/items/${parado.id}`, { isActive: false })).status).toBe(200);

  await criarColaborador(api, { name: 'Pessoa ativa 1', email: 'ativa1@teste.dev' });
  await criarColaborador(api, { name: 'Pessoa ativa 2', email: 'ativa2@teste.dev' });
  const afastada = await criarColaborador(api, { name: 'Pessoa desativada', email: 'desativada@teste.dev' });
  expect((await api.put(`/api/people/${afastada}`, { isActive: false })).status).toBe(200);
  const excluida = await criarColaborador(api, { name: 'Pessoa na lixeira', email: 'lixeira@teste.dev' });
  expect((await api.delete(`/api/people/${excluida}`)).status).toBe(200);

  // Além do administrador com que o harness entra.
  expect((await api.post('/api/users', { name: 'Conta ativa', email: 'conta.ativa@teste.dev' })).status).toBe(201);
  const saiu = await api.post<{ id: string }>('/api/users', { name: 'Conta desativada', email: 'conta.desativada@teste.dev' });
  expect(saiu.status).toBe(201);
  expect((await api.put(`/api/users/${saiu.body.id}`, { isActive: false })).status).toBe(200);
});

afterAll(async () => {
  await api.fechar();
});

async function contagem(rota: string): Promise<Stats> {
  const { status, body } = await api.get<Stats>(rota);
  expect(status).toBe(200);
  return body;
}

async function listar(rota: string): Promise<Envelope> {
  const { status, body } = await api.get<Envelope>(rota);
  expect(status).toBe(200);
  return body;
}

describe('os cartões do Estoque', () => {
  it('contam itens, e os dois recortes somam o total', async () => {
    expect(await contagem('/api/stock/items/stats')).toEqual({ total: 3, ativos: 2, desativados: 1 });
  });

  it('cada número é o total da lista que o cartão abre, e o outro recorte não aparece nela', async () => {
    const stats = await contagem('/api/stock/items/stats');
    const ativos = await listar('/api/stock/items?isActive=true');
    const desativados = await listar('/api/stock/items?isActive=false');

    expect((await listar('/api/stock/items')).total).toBe(stats.total);
    expect(ativos.total).toBe(stats.ativos);
    expect(ativos.rows.map((item) => item.name)).toEqual(['Item ativo 1', 'Item ativo 2']);
    expect(desativados.total).toBe(stats.desativados);
    expect(desativados.rows.map((item) => item.name)).toEqual(['Item desativado']);
  });

  it('recorte que não existe é 422', async () => {
    expect((await api.get('/api/stock/items?isActive=talvez')).status).toBe(422);
  });
});

describe('os cartões de Colaboradores', () => {
  it('não contam a lixeira, e os dois recortes somam o total', async () => {
    expect(await contagem('/api/people/stats')).toEqual({ total: 3, ativos: 2, desativados: 1 });
  });

  it('cada número é o total da lista que o cartão abre, e o outro recorte não aparece nela', async () => {
    const stats = await contagem('/api/people/stats');
    const ativos = await listar('/api/people?isActive=true');
    const desativados = await listar('/api/people?isActive=false');

    expect((await listar('/api/people')).total).toBe(stats.total);
    expect(ativos.total).toBe(stats.ativos);
    expect(ativos.rows.map((pessoa) => pessoa.name)).toEqual(['Pessoa ativa 1', 'Pessoa ativa 2']);
    expect(desativados.total).toBe(stats.desativados);
    expect(desativados.rows.map((pessoa) => pessoa.name)).toEqual(['Pessoa desativada']);
  });

  it('recorte que não existe é 422', async () => {
    expect((await api.get('/api/people?isActive=talvez')).status).toBe(422);
  });

  it('o filtro é só de quem tem os cartões: em outra tabela, a chave é 422', async () => {
    expect((await api.get('/api/manufacturers?isActive=true')).status).toBe(422);
  });

  it('a rota dos cartões não existe em outra tabela', async () => {
    expect((await api.get('/api/manufacturers/stats')).status).toBe(404);
  });
});

describe('os cartões de Usuários', () => {
  it('contam as contas, a do administrador junto, e os dois recortes somam o total', async () => {
    expect(await contagem('/api/users/stats')).toEqual({ total: 3, ativos: 2, desativados: 1 });
  });

  it('cada número é o total da lista que o cartão abre, e o outro recorte não aparece nela', async () => {
    const stats = await contagem('/api/users/stats');
    const ativos = await listar('/api/users?isActive=true');
    const desativados = await listar('/api/users?isActive=false');

    expect((await listar('/api/users')).total).toBe(stats.total);
    expect(ativos.total).toBe(stats.ativos);
    expect(ativos.rows.map((conta) => conta.name)).not.toContain('Conta desativada');
    expect(desativados.total).toBe(stats.desativados);
    expect(desativados.rows.map((conta) => conta.name)).toEqual(['Conta desativada']);
  });

  it('o recorte e a busca andam juntos', async () => {
    expect((await listar('/api/users?isActive=false&q=ativa')).rows.map((conta) => conta.name)).toEqual(['Conta desativada']);
    expect((await listar('/api/users?isActive=true&q=desativada')).total).toBe(0);
  });

  it('recorte que não existe é 422', async () => {
    expect((await api.get('/api/users?isActive=talvez')).status).toBe(422);
  });
});
