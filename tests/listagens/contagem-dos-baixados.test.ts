import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import { criarAtivo, criarFabricante, criarModelo, idsDoSeed, motivoDaBaixa } from '../helpers/fixtures';

// OS CARTÕES DA VISTA BAIXADOS (BV): um por motivo, e o número bate com a lista que ele abre.

interface Stats {
  total: number;
  retired: number;
  byRetiredReason: { id: string; name: string; total: number }[];
}

interface Envelope {
  rows: { id: string }[];
  total: number;
}

let api: ApiDeTeste;
let statusId = '';
let modelId = '';
let vendido = '';
let doado = '';

async function baixado(retiredReasonId: string): Promise<string> {
  const ativo = await criarAtivo(api, { statusId, modelId });
  const baixa = await api.post(`/api/assets/${ativo.id}/retire`, { retiredReasonId });
  expect(baixa.status, JSON.stringify(baixa.body)).toBe(200);
  return ativo.id;
}

async function contagem(): Promise<Stats> {
  const { status, body } = await api.get<Stats>('/api/assets/stats');
  expect(status).toBe(200);
  return body;
}

const totalDe = (stats: Stats, nome: string) => stats.byRetiredReason.find((motivo) => motivo.name === nome)?.total;

beforeAll(async () => {
  api = await criarApi();
  const seed = await idsDoSeed();
  statusId = seed.statusDeployableId;
  const fabricanteId = await criarFabricante(api, 'Fabricante dos Baixados');
  modelId = await criarModelo(api, { categoriaId: seed.categoriaId, fabricanteId });
  vendido = await motivoDaBaixa('Vendido');
  doado = await motivoDaBaixa('Doado');
});

afterAll(async () => {
  await api.fechar();
});

describe('GET /api/assets/stats: os motivos', () => {
  it('conta um por motivo, em ordem de nome, e o zerado continua lá', async () => {
    await baixado(vendido);
    await baixado(vendido);
    await baixado(doado);

    const stats = await contagem();
    expect(stats.retired).toBe(3);
    expect(totalDe(stats, 'Vendido')).toBe(2);
    expect(totalDe(stats, 'Doado')).toBe(1);
    expect(totalDe(stats, 'Roubado')).toBe(0);

    const nomes = stats.byRetiredReason.map((motivo) => motivo.name);
    expect(nomes).toEqual([...nomes].sort((a, b) => a.localeCompare(b, 'pt-BR')));
    expect(stats.byRetiredReason.reduce((soma, motivo) => soma + motivo.total, 0)).toBe(stats.retired);
  });

  it('o que foi para a lixeira ou teve a baixa revertida sai da conta, como sai da lista', async () => {
    const antes = totalDe(await contagem(), 'Extraviado');
    const extraviado = await motivoDaBaixa('Extraviado');
    const apagado = await baixado(extraviado);
    const revertido = await baixado(extraviado);

    expect((await api.delete(`/api/assets/${apagado}`)).status).toBe(200);
    expect((await api.post(`/api/assets/${revertido}/unretire`)).status).toBe(200);

    expect(totalDe(await contagem(), 'Extraviado')).toBe(antes);
  });
});

describe('GET /api/assets?retiredReasonId=', () => {
  it('recorta a vista Baixados, e o número bate com o cartão', async () => {
    const { status, body } = await api.get<Envelope>(`/api/assets?view=retired&retiredReasonId=${vendido}`);

    expect(status).toBe(200);
    expect(body.total).toBe(totalDe(await contagem(), 'Vendido'));
  });

  it('recusa o que não é identificador', async () => {
    const { status } = await api.get('/api/assets?view=retired&retiredReasonId=vendido');
    expect(status).toBe(422);
  });
});
