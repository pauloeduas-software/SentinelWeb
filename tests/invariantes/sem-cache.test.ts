import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarApi, type ApiDeTeste } from '../helpers/app';

// NENHUMA RESPOSTA DA API VAI PARA CACHE (`server/infra/http/sem-cache.ts`).
//
// As rotas de credencial já são cobertas em `sessao.test.ts` e
// `senha-temporaria.test.ts`; aqui fica o resto: uma listagem comum, que é dado
// de colaborador, e o 404 de um caminho de `/api` que não existe.

let api: ApiDeTeste;

beforeAll(async () => {
  api = await criarApi();
});

afterAll(async () => {
  await api.fechar();
});

describe('Cache-Control: no-store em toda a API', () => {
  it('numa listagem comum', async () => {
    const resposta = await api.get('/api/people');
    expect(resposta.status).toBe(200);
    expect(resposta.headers['cache-control']).toBe('no-store');
  });

  it('no 404 de um caminho que não existe', async () => {
    const resposta = await api.get('/api/nao-existe');
    expect(resposta.status).toBe(404);
    expect(resposta.headers['cache-control']).toBe('no-store');
  });
});
