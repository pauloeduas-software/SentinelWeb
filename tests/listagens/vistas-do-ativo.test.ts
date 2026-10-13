import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import { criarAtivo, criarFabricante, criarModelo, idsDoSeed } from '../helpers/fixtures';

// AS TRÊS VISTAS DA LISTAGEM DE ATIVOS — e as duas colunas que elas separam (D19):
//
//   retiredAt  saiu do PATRIMÔNIO — vendido, descartado, roubado.
//              É fato contábil e não volta.
//   deletedAt  foi cadastrado errado. É a lixeira.
//
// `active` exclui o baixado; `retired` mostra só ele.

interface Linha {
  id: string;
  assetTag: string;
}

interface Envelope {
  total: number;
  rows: Linha[];
}

interface Stats {
  total: number;
  retired: number;
}

let api: ApiDeTeste;
let noEstoque = { id: '', assetTag: '' };
let baixado = { id: '', assetTag: '' };

beforeAll(async () => {
  api = await criarApi();
  const seed = await idsDoSeed();

  const fabricanteId = await criarFabricante(api);
  const modelId = await criarModelo(api, { categoriaId: seed.categoriaId, fabricanteId });

  noEstoque = await criarAtivo(api, { statusId: seed.statusDeployableId, modelId, name: 'No estoque' });
  baixado = await criarAtivo(api, { statusId: seed.statusDeployableId, modelId, name: 'Vendido' });

  const saiu = await api.post(`/api/assets/${baixado.id}/retire`, { retiredReason: 'VENDIDO' });
  expect(saiu.status).toBe(200);
});

afterAll(async () => {
  await api.fechar();
});

async function listar(query = ''): Promise<Envelope> {
  const { status, body } = await api.get<Envelope>(`/api/assets${query}`);
  expect(status).toBe(200);
  return body;
}

const temEtiqueta = (envelope: Envelope, tag: string) => envelope.rows.some((l) => l.assetTag === tag);

describe('vista padrão', () => {
  it('mostra o que está em operação', async () => {
    const lista = await listar();
    expect(temEtiqueta(lista, noEstoque.assetTag)).toBe(true);
  });

  it('esconde o BAIXADO — ele saiu do patrimônio', async () => {
    const lista = await listar();
    expect(temEtiqueta(lista, baixado.assetTag)).toBe(false);
  });
});

describe('?view=retired', () => {
  it('mostra só o baixado', async () => {
    const lista = await listar('?view=retired');
    expect(temEtiqueta(lista, baixado.assetTag)).toBe(true);
    expect(temEtiqueta(lista, noEstoque.assetTag)).toBe(false);
  });

  it('recusa vista inventada com 422, dizendo quais existem', async () => {
    const { status, body } = await api.get<{ error: string }>('/api/assets?view=xpto');
    expect(status).toBe(422);
    expect(body.error).toMatch(/retired/);
  });

  it('recusa a vista `archived`, que deixou de existir', async () => {
    const { status } = await api.get('/api/assets?view=archived');
    expect(status).toBe(422);
  });
});

describe('/stats', () => {
  it('conta o baixado à parte, e `total` NÃO o inclui', async () => {
    const { status, body } = await api.get<Stats>('/api/assets/stats');
    expect(status).toBe(200);

    expect(body.retired).toBe(1);

    // O cabeçalho é o cabeçalho DAQUELA lista: um número que não bate com o que
    // a tabela mostra é pior que número nenhum.
    const padrao = await listar('?perPage=100');
    expect(body.total).toBe(padrao.total);
  });
});
