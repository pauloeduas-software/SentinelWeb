import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import {
  criarAtivo, criarFabricante, criarItemDeEstoque, criarLicenca, criarModelo, diaNoBrasil, idsDoSeed, motivoDaBaixa,
} from '../helpers/fixtures';

// OS CARTÕES SEGUEM A CATEGORIA (CM) — `?categoryId=` no `/stats` das três listas
// que têm o filtro: Computadores, Estoque e Licenças. O cartão conta a lista que
// ele abre, e com a categoria escolhida a lista vem recortada: cada número aqui é
// conferido também contra o `total` da lista com o mesmo recorte.
//
// As categorias nascem aqui, pela API, e por isso os números são exatos: só este
// arquivo cadastra nelas.

let api: ApiDeTeste;
let seed: Awaited<ReturnType<typeof idsDoSeed>>;

beforeAll(async () => {
  api = await criarApi();
  seed = await idsDoSeed();
});

afterAll(async () => {
  await api.fechar();
});

async function categoria(name: string, type: 'ASSET' | 'LICENSE' | 'STOCK'): Promise<string> {
  const criada = await api.post<{ id: string }>('/api/categories', { name, type });
  expect(criada.status).toBe(201);
  return criada.body.id;
}

async function totalDaLista(rota: string): Promise<number> {
  const { status, body } = await api.get<{ total: number }>(rota);
  expect(status).toBe(200);
  return body.total;
}

describe('Computadores', () => {
  it('contam só a categoria escolhida, na vista Ativos e na Baixados', async () => {
    const [notebook, servidor] = await Promise.all([
      categoria('Notebook dos cartões', 'ASSET'),
      categoria('Servidor dos cartões', 'ASSET'),
    ]);
    const fabricanteId = await criarFabricante(api, 'Fabricante dos cartões');
    const [modeloNotebook, modeloServidor] = await Promise.all([
      criarModelo(api, { categoriaId: notebook, fabricanteId, name: 'Modelo notebook dos cartões' }),
      criarModelo(api, { categoriaId: servidor, fabricanteId, name: 'Modelo servidor dos cartões' }),
    ]);
    const disponivel = { statusId: seed.statusDeployableId, modelId: modeloNotebook };
    await criarAtivo(api, disponivel);
    await criarAtivo(api, disponivel);
    const vendido = await criarAtivo(api, disponivel);
    expect((await api.post(`/api/assets/${vendido.id}/retire`, { retiredReasonId: await motivoDaBaixa() })).status).toBe(200);
    await criarAtivo(api, { statusId: seed.statusDeployableId, modelId: modeloServidor });

    const { status, body } = await api.get<{
      total: number;
      byType: Record<string, number>;
      retired: number;
      byRetiredReason: { name: string; total: number }[];
    }>(`/api/assets/stats?categoryId=${notebook}`);
    expect(status).toBe(200);
    expect(body.total).toBe(2);
    expect(body.byType).toEqual({ DEPLOYABLE: 2, IN_USE: 0, PENDING: 0, UNDEPLOYABLE: 0 });
    expect(body.retired).toBe(1);
    expect(body.byRetiredReason.find((motivo) => motivo.name === 'Vendido')?.total).toBe(1);

    expect(body.byType.DEPLOYABLE).toBe(await totalDaLista(`/api/assets?categoryId=${notebook}&statusType=DEPLOYABLE`));
    expect(body.retired).toBe(await totalDaLista(`/api/assets?view=retired&categoryId=${notebook}`));
  });
});

describe('Estoque', () => {
  it('contam só a categoria escolhida', async () => {
    const [mouse, cabo] = await Promise.all([
      categoria('Mouse dos cartões', 'STOCK'),
      categoria('Cabo dos cartões', 'STOCK'),
    ]);
    await criarItemDeEstoque(api, { name: 'Mouse USB dos cartões', categoryId: mouse, qty: 3 });
    const parado = await criarItemDeEstoque(api, { name: 'Mouse PS/2 dos cartões', categoryId: mouse, qty: 1 });
    expect((await api.put(`/api/stock/items/${parado.id}`, { isActive: false })).status).toBe(200);
    await criarItemDeEstoque(api, { name: 'Cabo HDMI dos cartões', categoryId: cabo, qty: 5 });

    const { status, body } = await api.get<{ total: number; ativos: number; desativados: number }>(
      `/api/stock/items/stats?categoryId=${mouse}`,
    );
    expect(status).toBe(200);
    expect(body).toEqual({ total: 2, ativos: 1, desativados: 1 });
    expect(body.ativos).toBe(await totalDaLista(`/api/stock/items?categoryId=${mouse}&isActive=true`));
  });
});

describe('Licenças', () => {
  it('contam só a categoria escolhida', async () => {
    const [so, design] = await Promise.all([
      categoria('Sistema operacional dos cartões', 'LICENSE'),
      categoria('Design dos cartões', 'LICENSE'),
    ]);
    await criarLicenca(api, { name: 'Windows dos cartões', categoryId: so, seatsTotal: 1 });
    await criarLicenca(api, { name: 'Linux dos cartões', categoryId: so, seatsTotal: 1, terminationDate: diaNoBrasil(0) });
    await criarLicenca(api, { name: 'Photoshop dos cartões', categoryId: design, seatsTotal: 1 });

    const { status, body } = await api.get<Record<string, number>>(`/api/licenses/stats?categoryId=${so}`);
    expect(status).toBe(200);
    expect(body).toEqual({ total: 2, ativas: 1, vencendo: 0, vencidas: 0, encerradas: 1 });
    expect(body.encerradas).toBe(await totalDaLista(`/api/licenses?categoryId=${so}&status=ENCERRADA`));
  });
});

describe('a borda', () => {
  it('recusa a categoria que não é identificador, e o parâmetro que não é dela', async () => {
    for (const rota of ['/api/assets/stats', '/api/stock/items/stats', '/api/licenses/stats']) {
      expect((await api.get(`${rota}?categoryId=notebook`)).status).toBe(422);
      expect((await api.get(`${rota}?q=mouse`)).status).toBe(422);
    }
  });
});
