import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import {
  criarAtivo, criarFabricante, criarItemDeEstoque, criarLicenca, criarModelo, idsDoSeed,
} from '../helpers/fixtures';

// O FILTRO `?categoryId=` DAS TRÊS LISTAGENS — Ativos, Licenças e Estoque.
//
// A regra do diretório vale aqui: toda asserção diz as duas metades — o que
// apareceu e o que NÃO apareceu —, porque um filtro que não filtra devolve a
// lista inteira, e a lista inteira contém a linha esperada.
//
// As categorias nascem aqui, pela API, e não do seed: o teste não pode quebrar
// porque alguém renomeou "Notebook".

interface Envelope {
  total: number;
  rows: { id: string }[];
}

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

async function ids(rota: string): Promise<string[]> {
  const { status, body } = await api.get<Envelope>(rota);
  expect(status).toBe(200);
  return body.rows.map((linha) => linha.id);
}

describe('Ativos', () => {
  it('filtra pela categoria do MODELO', async () => {
    const [notebook, servidor] = await Promise.all([
      categoria('Notebook do filtro', 'ASSET'),
      categoria('Servidor do filtro', 'ASSET'),
    ]);
    const fabricanteId = await criarFabricante(api, 'Fabricante do filtro');
    const [modeloNotebook, modeloServidor] = await Promise.all([
      criarModelo(api, { categoriaId: notebook, fabricanteId, name: 'Modelo notebook do filtro' }),
      criarModelo(api, { categoriaId: servidor, fabricanteId, name: 'Modelo servidor do filtro' }),
    ]);
    const doNotebook = await criarAtivo(api, { statusId: seed.statusDeployableId, modelId: modeloNotebook });
    const doServidor = await criarAtivo(api, { statusId: seed.statusDeployableId, modelId: modeloServidor });

    const filtrados = await ids(`/api/assets?perPage=100&categoryId=${notebook}`);
    expect(filtrados).toContain(doNotebook.id);
    expect(filtrados).not.toContain(doServidor.id);
  });

  it('recusa categoria que não é UUID com 422', async () => {
    expect((await api.get('/api/assets?categoryId=notebook')).status).toBe(422);
  });
});

describe('Licenças', () => {
  it('filtra pela categoria da licença', async () => {
    const [so, design] = await Promise.all([
      categoria('Sistema operacional do filtro', 'LICENSE'),
      categoria('Design do filtro', 'LICENSE'),
    ]);
    const windows = await criarLicenca(api, { name: 'Windows do filtro', categoryId: so, seatsTotal: 1 });
    const photoshop = await criarLicenca(api, { name: 'Photoshop do filtro', categoryId: design, seatsTotal: 1 });

    const filtradas = await ids(`/api/licenses?perPage=100&categoryId=${so}`);
    expect(filtradas).toContain(windows.id);
    expect(filtradas).not.toContain(photoshop.id);
  });

  it('recusa categoria que não é UUID com 422, e chave desconhecida continua 422', async () => {
    // A segunda metade prova que separar `categoryId` da query não afrouxou o
    // `parseListQuery`: o que não é de nenhum dos dois ainda é recusado.
    expect((await api.get('/api/licenses?categoryId=design')).status).toBe(422);
    expect((await api.get(`/api/licenses?categoria=${seed.categoriaLicencaId}`)).status).toBe(422);
  });
});

describe('Configurações — a aba Categorias separada por tipo', () => {
  it('?type= devolve só as categorias daquele tipo', async () => {
    const deLicenca = await categoria('Licença da aba', 'LICENSE');
    const deEstoque = await categoria('Estoque da aba', 'STOCK');

    const { status, body } = await api.get<{ rows: { id: string; type: string }[] }>(
      '/api/categories?perPage=100&type=LICENSE',
    );
    expect(status).toBe(200);
    expect(body.rows.map((linha) => linha.id)).toContain(deLicenca);
    expect(body.rows.map((linha) => linha.id)).not.toContain(deEstoque);
    expect(new Set(body.rows.map((linha) => linha.type))).toEqual(new Set(['LICENSE']));
  });

  it('recusa tipo fora da lista, e a tabela sem filtro declarado continua recusando a chave', async () => {
    expect((await api.get('/api/categories?type=GADGET')).status).toBe(422);
    // Fabricante não declara `optionFilter`: a chave chega ao `parseListQuery`,
    // que é estrito.
    expect((await api.get('/api/manufacturers?type=ASSET')).status).toBe(422);
  });
});

describe('Estoque', () => {
  it('filtra pela categoria do item', async () => {
    const [periferico, cabo] = await Promise.all([
      categoria('Periférico do filtro', 'STOCK'),
      categoria('Cabo do filtro', 'STOCK'),
    ]);
    const mouse = await criarItemDeEstoque(api, { name: 'Mouse do filtro', categoryId: periferico, qty: 1 });
    const hdmi = await criarItemDeEstoque(api, { name: 'HDMI do filtro', categoryId: cabo, qty: 1 });

    const filtrados = await ids(`/api/stock/items?perPage=100&categoryId=${periferico}`);
    expect(filtrados).toContain(mouse.id);
    expect(filtrados).not.toContain(hdmi.id);
  });

  it('recusa categoria que não é UUID com 422, e chave desconhecida continua 422', async () => {
    expect((await api.get('/api/stock/items?categoryId=cabo')).status).toBe(422);
    expect((await api.get(`/api/stock/items?categoria=${seed.categoriaEstoqueId}`)).status).toBe(422);
  });
});
