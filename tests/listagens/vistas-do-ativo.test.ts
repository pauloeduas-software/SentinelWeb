import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import { criarAtivo, criarFabricante, criarModelo, idsDoSeed } from '../helpers/fixtures';

// AS QUATRO VISTAS DA LISTAGEM DE ATIVOS — e as três colunas que elas separam.
//
// `active` exclui DUAS coisas, por dois motivos diferentes (D19):
//
//   retiredAt            saiu do PATRIMÔNIO — vendido, descartado, roubado.
//                        É fato contábil e não volta.
//   status.type ARCHIVED saiu da OPERAÇÃO. É decisão reversível: volta
//                        trocando o status.
//   deletedAt            foi cadastrado errado. É a lixeira.
//
// Somar os três numa vista só apagaria a diferença exatamente onde ela é
// operacional: quem procura o notebook que volta do depósito não deveria
// precisar varrer a lista dos que foram vendidos.
//
// A ARMADILHA que o último teste fecha: os contadores do cabeçalho viraram
// filtro clicável (`?statusId=`). Se `active` excluísse `ARCHIVED` sem exceção,
// clicar no contador de um status arquivado abriria uma lista VAZIA — um filtro
// que o próprio sistema ofereceu e que não devolve nada.

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
  archived: number;
}

let api: ApiDeTeste;
let statusArquivadoId = '';
let statusDeployableId = '';
let arquivado = { id: '', assetTag: '' };
let noEstoque = { id: '', assetTag: '' };
let descomissionado = { id: '', assetTag: '' };

beforeAll(async () => {
  api = await criarApi();
  const seed = await idsDoSeed();
  statusArquivadoId = seed.statusArquivadoId;
  statusDeployableId = seed.statusDeployableId;

  const fabricanteId = await criarFabricante(api);
  const modelId = await criarModelo(api, { categoriaId: seed.categoriaId, fabricanteId });

  // Um de cada, para as vistas terem o que separar.
  noEstoque = await criarAtivo(api, { statusId: statusDeployableId, modelId, name: 'No estoque' });
  arquivado = await criarAtivo(api, { statusId: statusArquivadoId, modelId, name: 'Arquivado' });
  descomissionado = await criarAtivo(api, { statusId: statusDeployableId, modelId, name: 'Vendido' });

  const saiu = await api.post(`/api/assets/${descomissionado.id}/retire`, { retiredReason: 'VENDIDO' });
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

  it('esconde o ARQUIVADO — ele saiu da operação', async () => {
    const lista = await listar();
    expect(temEtiqueta(lista, arquivado.assetTag)).toBe(false);
  });

  it('esconde o DESCOMISSIONADO — ele saiu do patrimônio', async () => {
    const lista = await listar();
    expect(temEtiqueta(lista, descomissionado.assetTag)).toBe(false);
  });
});

describe('?view=archived', () => {
  it('mostra só o arquivado', async () => {
    const lista = await listar('?view=archived');
    expect(temEtiqueta(lista, arquivado.assetTag)).toBe(true);
    expect(temEtiqueta(lista, noEstoque.assetTag)).toBe(false);
  });

  it('NÃO mistura o descomissionado — são duas saídas diferentes (D19)', async () => {
    const lista = await listar('?view=archived');
    expect(temEtiqueta(lista, descomissionado.assetTag)).toBe(false);

    const retirados = await listar('?view=retired');
    expect(temEtiqueta(retirados, descomissionado.assetTag)).toBe(true);
    expect(temEtiqueta(retirados, arquivado.assetTag)).toBe(false);
  });

  it('recusa vista inventada com 422, dizendo quais existem', async () => {
    const { status, body } = await api.get<{ error: string }>('/api/assets?view=xpto');
    expect(status).toBe(422);
    expect(body.error).toMatch(/archived/);
  });
});

describe('o filtro por status vence a exclusão', () => {
  it('?statusId= do arquivado DEVOLVE o ativo, em vez de uma lista vazia', async () => {
    // Sem esta regra, clicar no contador "Arquivado" do cabeçalho abriria uma
    // lista vazia. Pedir um status pelo id é dizer que se quer aquele status.
    const lista = await listar(`?statusId=${statusArquivadoId}`);
    expect(temEtiqueta(lista, arquivado.assetTag)).toBe(true);
  });

  it('?statusId= de um status normal continua sem trazer o arquivado', async () => {
    const lista = await listar(`?statusId=${statusDeployableId}`);
    expect(temEtiqueta(lista, noEstoque.assetTag)).toBe(true);
    expect(temEtiqueta(lista, arquivado.assetTag)).toBe(false);
  });
});

describe('/stats', () => {
  it('conta o arquivado à parte, e `total` NÃO o inclui', async () => {
    const { status, body } = await api.get<Stats>('/api/assets/stats');
    expect(status).toBe(200);

    expect(body.archived).toBe(1);
    expect(body.retired).toBe(1);

    // O cabeçalho é o cabeçalho DAQUELA lista: um número que não bate com o que
    // a tabela mostra é pior que número nenhum.
    const padrao = await listar('?perPage=100');
    expect(body.total).toBe(padrao.total);
  });
});
