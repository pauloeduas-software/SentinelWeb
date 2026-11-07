import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../server/infra/database/prismaClient';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import { criarAtivo, criarFabricante, criarModelo, idsDoSeed } from '../helpers/fixtures';

// OS CARTÕES DA TELA DE POSTOS — `GET /api/workstations/stats` e `?view=sem-uso`.
//
// Cada posto cai em um status só, e o número do cartão é o total da lista que
// ele abre. Um número que não bate com a lista é pior que número nenhum.

interface Stats {
  total: number;
  ocupados: number;
  vagos: number;
  semUso: number;
}

interface Envelope {
  rows: { id: string; name: string }[];
  total: number;
}

let api: ApiDeTeste;

/** Um posto pelo Prisma: o que se testa aqui é a contagem, não o cadastro. */
async function mesa(name: string): Promise<string> {
  const criado = await prisma.workstation.create({
    data: { name, location: { create: { name: `Local de ${name}` } } },
    select: { id: true },
  });
  return criado.id;
}

beforeAll(async () => {
  api = await criarApi();
  const seed = await idsDoSeed();
  const fabricanteId = await criarFabricante(api, 'Fabricante dos Cartões');
  const modelId = await criarModelo(api, { categoriaId: seed.categoriaId, fabricanteId });
  const pessoa = await prisma.person.create({ data: { name: 'Quem Ocupa' }, select: { id: true } });

  const entregar = async (assetTag: string, serial: string, workstationId: string) => {
    const ativo = await criarAtivo(api, { statusId: seed.statusDeployableId, modelId, name: assetTag, serial, assetTag });
    const r = await api.post(`/api/assets/${ativo.id}/checkout`, { targetType: 'WORKSTATION', targetWorkstationId: workstationId });
    expect(r.status, `entrega falhou: ${JSON.stringify(r.body)}`).toBe(201);
  };
  const ocupar = async (workstationId: string) => {
    const r = await api.post(`/api/workstations/${workstationId}/occupants`, { personId: pessoa.id });
    expect(r.status, `ocupação falhou: ${JSON.stringify(r.body)}`).toBe(201);
  };

  const ocupadaComComputador = await mesa('Ocupada com computador');
  await entregar('CARTAO-001', 'SN-CARTAO-001', ocupadaComComputador);
  await ocupar(ocupadaComComputador);

  // Gente sem equipamento é Ocupado: quem decide o status é a ocupação.
  await ocupar(await mesa('Ocupada sem computador'));

  await entregar('CARTAO-002', 'SN-CARTAO-002', await mesa('Vaga'));

  await mesa('Sem uso');
});

afterAll(async () => {
  await api.fechar();
});

async function contagem(): Promise<Stats> {
  const { status, body } = await api.get<Stats>('/api/workstations/stats');
  expect(status).toBe(200);
  return body;
}

async function listar(view: string): Promise<Envelope> {
  const { status, body } = await api.get<Envelope>(`/api/workstations?view=${view}`);
  expect(status).toBe(200);
  return body;
}

describe('GET /api/workstations/stats', () => {
  it('conta cada posto em um status, e os três somam o total', async () => {
    const stats = await contagem();

    expect(stats).toEqual({ total: 4, ocupados: 2, vagos: 1, semUso: 1 });
    expect(stats.ocupados + stats.vagos + stats.semUso).toBe(stats.total);
  });

  it('cada número é o total da lista que o cartão abre', async () => {
    const stats = await contagem();

    expect((await listar('todos')).total).toBe(stats.total);
    expect((await listar('ocupados')).total).toBe(stats.ocupados);
    expect((await listar('vagos')).total).toBe(stats.vagos);
    expect((await listar('sem-uso')).total).toBe(stats.semUso);
  });
});

describe('GET /api/workstations?view=sem-uso', () => {
  it('traz só o posto sem gente e sem equipamento', async () => {
    const { rows } = await listar('sem-uso');

    expect(rows.map((posto) => posto.name)).toEqual(['Sem uso']);
  });

  it('recorte que não existe é 422', async () => {
    const { status } = await api.get('/api/workstations?view=parados');

    expect(status).toBe(422);
  });
});
