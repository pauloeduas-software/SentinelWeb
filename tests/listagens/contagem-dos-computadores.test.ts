import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../server/infra/database/prismaClient';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import { criarAtivo, criarFabricante, criarModelo, idsDoSeed } from '../helpers/fixtures';

// OS CARTÕES DE COMPUTADORES — `GET /api/assets/stats` e `?statusType=` (BT).
//
// O cartão é do TIPO de status, e não do status: o status é cadastro livre, e cada um
// novo soma no tipo dele em vez de virar mais um cartão.

interface Stats {
  total: number;
  byType: Record<'DEPLOYABLE' | 'IN_USE' | 'PENDING' | 'UNDEPLOYABLE', number>;
}

interface Envelope {
  rows: { id: string; status: { name: string } }[];
  total: number;
}

let api: ApiDeTeste;

beforeAll(async () => {
  api = await criarApi();
  const seed = await idsDoSeed();
  const fabricanteId = await criarFabricante(api, 'Fabricante dos Tipos');
  const modelId = await criarModelo(api, { categoriaId: seed.categoriaId, fabricanteId });

  const pendentes = await Promise.all(['Na assistência', 'Aguardando peça'].map((name) => (
    prisma.statusLabel.create({ data: { name, type: 'PENDING' }, select: { id: true } })
  )));

  await criarAtivo(api, { statusId: pendentes[0].id, modelId, name: 'Na assistência' });
  await criarAtivo(api, { statusId: pendentes[1].id, modelId, name: 'Aguardando peça' });
  await criarAtivo(api, { statusId: seed.statusDeployableId, modelId, name: 'Guardado' });
});

afterAll(async () => {
  await api.fechar();
});

async function contagem(): Promise<Stats> {
  const { status, body } = await api.get<Stats>('/api/assets/stats');
  expect(status).toBe(200);
  return body;
}

async function listar(query: string): Promise<Envelope> {
  const { status, body } = await api.get<Envelope>(`/api/assets${query}`);
  expect(status).toBe(200);
  return body;
}

describe('GET /api/assets/stats', () => {
  it('soma os status do mesmo tipo, e o tipo zerado continua lá', async () => {
    const stats = await contagem();

    expect(stats.total).toBe(3);
    expect(stats.byType).toEqual({ DEPLOYABLE: 1, IN_USE: 0, PENDING: 2, UNDEPLOYABLE: 0 });
  });

  it('cada número é o total da lista que o cartão abre', async () => {
    const { byType } = await contagem();

    expect((await listar('?statusType=PENDING')).total).toBe(byType.PENDING);
    expect((await listar('?statusType=DEPLOYABLE')).total).toBe(byType.DEPLOYABLE);
    expect((await listar('?statusType=IN_USE')).total).toBe(byType.IN_USE);
  });
});

describe('GET /api/assets?statusType=', () => {
  it('traz todos os status do tipo, e nenhum de outro', async () => {
    const { rows } = await listar('?statusType=PENDING');

    expect(rows.map((ativo) => ativo.status.name).sort()).toEqual(['Aguardando peça', 'Na assistência']);
  });

  it('tipo que não existe é 422', async () => {
    expect((await api.get('/api/assets?statusType=PARADO')).status).toBe(422);
  });
});
