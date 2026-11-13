import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import { criarAtivo, criarFabricante, criarModelo, diaNoBrasil, idsDoSeed } from '../helpers/fixtures';
import { prisma } from '../../server/infra/database/prismaClient';

// A GARANTIA DO COMPUTADOR (CO): o último dia da garantia do fabricante.
//
// É um prazo, como o vencimento da licença: pode ser futuro, e não antecede a
// compra. A ficha diz quantos dias faltam, contados no dia de Brasília pelo
// servidor; o banco recusa a ordem invertida por baixo
// (`assets_garantia_nao_antecede_compra`).

let api: ApiDeTeste;
let statusId = '';
let modelId = '';

beforeAll(async () => {
  api = await criarApi();
  const seed = await idsDoSeed();
  statusId = seed.statusDeployableId;
  const fabricanteId = await criarFabricante(api, 'Fabricante da garantia');
  modelId = await criarModelo(api, { categoriaId: seed.categoriaId, fabricanteId });
});

afterAll(async () => {
  await api.fechar();
});

const cadastrar = (datas: { purchaseDate?: string; warrantyExpiresAt?: string }) =>
  api.post<{ id: string; warrantyExpiresAt: string | null; error: string }>('/api/assets', { statusId, modelId, ...datas });

describe('o cadastro', () => {
  it('aceita a garantia futura, e a ficha diz quantos dias faltam', async () => {
    const { status, body } = await cadastrar({ purchaseDate: diaNoBrasil(-10), warrantyExpiresAt: diaNoBrasil(120) });
    expect(status).toBe(201);
    expect(body.warrantyExpiresAt).toBe(`${diaNoBrasil(120)}T00:00:00.000Z`);

    const ficha = await api.get<{ diasDeGarantia: number | null }>(`/api/assets/${body.id}`);
    expect(ficha.body.diasDeGarantia).toBe(120);
  });

  it('a garantia que já acabou conta para trás, e sem garantia não há prazo', async () => {
    const vencida = await cadastrar({ warrantyExpiresAt: diaNoBrasil(-3) });
    expect((await api.get<{ diasDeGarantia: number }>(`/api/assets/${vencida.body.id}`)).body.diasDeGarantia).toBe(-3);

    const sem = await criarAtivo(api, { statusId, modelId });
    expect((await api.get<{ diasDeGarantia: number | null }>(`/api/assets/${sem.id}`)).body.diasDeGarantia).toBeNull();
  });

  it('recusa a garantia antes da compra, com as duas datas', async () => {
    const { status, body } = await cadastrar({ purchaseDate: '2026-03-10', warrantyExpiresAt: '2026-03-05' });
    expect(status).toBe(422);
    expect(body.error).toBe('O fim da garantia (05/03/2026) não pode ser antes da data da compra (10/03/2026).');
  });

  it('aceita a garantia no mesmo dia da compra', async () => {
    expect((await cadastrar({ purchaseDate: '2026-03-10', warrantyExpiresAt: '2026-03-10' })).status).toBe(201);
  });

  it('a data inválida é recusada em português, com o nome do campo', async () => {
    const { status, body } = await cadastrar({ warrantyExpiresAt: '10/03/2027' });
    expect(status).toBe(422);
    expect(body.error).toContain('Fim da garantia: use uma data no formato AAAA-MM-DD');
  });
});

describe('a edição', () => {
  it('confere as datas como ficam: mudar só a compra também inverte a ordem', async () => {
    const { body: criado } = await cadastrar({ purchaseDate: '2026-01-10', warrantyExpiresAt: '2026-02-10' });
    const { body: lido } = await api.get<{ updatedAt: string }>(`/api/assets/${criado.id}`);

    const { status, body } = await api.put<{ error: string }>(
      `/api/assets/${criado.id}`, { purchaseDate: '2026-03-01', updatedAt: lido.updatedAt },
    );
    expect(status).toBe(422);
    expect(body.error).toBe('O fim da garantia (10/02/2026) não pode ser antes da data da compra (01/03/2026).');
  });

  it('grava a garantia nova e a auditoria guarda a troca', async () => {
    const { body: criado } = await cadastrar({ purchaseDate: '2026-01-10' });
    const { body: lido } = await api.get<{ updatedAt: string }>(`/api/assets/${criado.id}`);

    const { status } = await api.put(`/api/assets/${criado.id}`, { warrantyExpiresAt: '2029-01-10', updatedAt: lido.updatedAt });
    expect(status).toBe(200);

    const log = await prisma.auditLog.findFirst({
      where: { entityType: 'Asset', entityId: criado.id, action: 'UPDATE' }, select: { changes: true },
    });
    expect(log?.changes).toEqual({ warrantyExpiresAt: { de: null, para: '2029-01-10T00:00:00.000Z' } });
  });
});

describe('o banco', () => {
  it('quem escreve por fora da API leva o erro do CHECK', async () => {
    const { body: criado } = await cadastrar({ purchaseDate: '2026-01-10', warrantyExpiresAt: '2026-02-10' });

    await expect(prisma.$executeRaw`UPDATE assets SET "warrantyExpiresAt" = '2026-01-01' WHERE id = ${criado.id}::uuid`)
      .rejects.toThrow(/assets_garantia_nao_antecede_compra/);
  });
});
