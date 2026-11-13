import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import { cenarioDePosse, motivoDaBaixa } from '../helpers/fixtures';

// A FICHA DO COMPUTADOR NA LIXEIRA (BW): ver o histórico não custa uma restauração. Ela
// abre para quem vê a Lixeira, e só para consultar: nenhuma escrita alcança o ativo.

let api: ApiDeTeste;
let supervisor: Awaited<ReturnType<ApiDeTeste['comoUsuario']>>;
let tecnico: Awaited<ReturnType<ApiDeTeste['comoUsuario']>>;
let cenario: Awaited<ReturnType<typeof cenarioDePosse>>;
let id = '';

beforeAll(async () => {
  api = await criarApi();
  supervisor = await api.comoUsuario('SUPERVISOR');
  tecnico = await api.comoUsuario('TECNICO');
  cenario = await cenarioDePosse(api, ' (lixeira)');
  id = cenario.ativo.id;

  const entrega = await api.post(`/api/assets/${id}/checkout`, { targetType: 'PERSON', targetPersonId: cenario.laura });
  expect(entrega.status).toBe(201);
  expect((await api.post(`/api/assets/${id}/checkin`, {})).status).toBe(200);

  expect((await api.delete(`/api/assets/${id}`)).status).toBe(200);
});

afterAll(async () => {
  await api.fechar();
});

describe('para quem vê a Lixeira', () => {
  it('a ficha abre e diz quando foi excluído', async () => {
    const { status, body } = await supervisor.get<{ deletedAt: string | null }>(`/api/assets/${id}`);

    expect(status).toBe(200);
    expect(body.deletedAt).toEqual(expect.any(String));
  });

  it('o histórico vem inteiro, sem restaurar', async () => {
    const { status, body } = await supervisor.get<{ total: number }>(`/api/assets/${id}/history`);

    expect(status).toBe(200);
    expect(body.total).toBe(2);
  });

  it('as abas respondem, e a Máquina vem vazia: ele vai para a lixeira sem ela (CL)', async () => {
    expect((await supervisor.get(`/api/assets/${id}/licenses`)).status).toBe(200);
    expect((await supervisor.get(`/api/assets/${id}/components`)).status).toBe(200);

    const { status, body } = await supervisor.get<{ hostname: string | null }>(`/api/assets/${id}/machine`);
    expect(status).toBe(200);
    expect(body.hostname).toBeNull();
  });

  it('nenhuma escrita alcança o ativo: abrir não é restaurar', async () => {
    const entrega = await supervisor.post(`/api/assets/${id}/checkout`, { targetType: 'PERSON', targetPersonId: cenario.laura });
    const baixa = await supervisor.post(`/api/assets/${id}/retire`, { retiredReasonId: await motivoDaBaixa() });

    expect(entrega.status).toBe(404);
    expect(baixa.status).toBe(404);
  });
});

describe('para o Técnico, que não vê a Lixeira (AV)', () => {
  it('o ativo excluído continua sem existir', async () => {
    expect((await tecnico.get(`/api/assets/${id}`)).status).toBe(404);
    expect((await tecnico.get(`/api/assets/${id}/history`)).status).toBe(404);
    expect((await tecnico.get(`/api/assets/${id}/licenses`)).status).toBe(404);
    expect((await tecnico.get(`/api/assets/${id}/components`)).status).toBe(404);

    const { body } = await tecnico.get<{ hostname: string | null }>(`/api/assets/${id}/machine`);
    expect(body.hostname).toBeNull();
  });
});

describe('fora da lixeira', () => {
  it('a ficha diz que não está nela, e restaurar é o que devolve o ativo', async () => {
    expect((await supervisor.post(`/api/assets/${id}/restore`)).status).toBe(200);

    const { body } = await tecnico.get<{ deletedAt: string | null }>(`/api/assets/${id}`);
    expect(body.deletedAt).toBeNull();
  });
});
