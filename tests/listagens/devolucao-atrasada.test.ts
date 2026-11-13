import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import { cenarioDePosse, criarAtivo, diaNoBrasil } from '../helpers/fixtures';
import { prisma } from '../../server/infra/database/prismaClient';

// A DEVOLUÇÃO ATRASADA (CQ): a ficha do computador diz quantos dias faltam para a
// devolução prevista da entrega aberta, negativo quando ela atrasou. A conta é do
// servidor, no dia de Brasília, e o dia do prazo ainda não é atraso.
//
// A entrega não aceita prazo no passado (`dataNaoPassada`): o atraso nasce do tempo
// passando, e o teste o fabrica movendo o prazo no banco.

let api: ApiDeTeste;
let cenario: Awaited<ReturnType<typeof cenarioDePosse>>;

beforeAll(async () => {
  api = await criarApi();
  cenario = await cenarioDePosse(api);
});

afterAll(async () => {
  await api.fechar();
});

async function entregarComPrazo(expectedCheckinAt?: string) {
  const { id } = await criarAtivo(api, { statusId: cenario.statusDeployableId, modelId: cenario.modelId });
  const entrega = await api.post<{ error?: string }>(`/api/assets/${id}/checkout`, {
    targetType: 'PERSON', targetPersonId: cenario.laura, ...(expectedCheckinAt ? { expectedCheckinAt } : {}),
  });
  expect(entrega.status).toBe(201);
  return id;
}

const diasParaDevolver = async (id: string) =>
  (await api.get<{ diasParaDevolver: number | null }>(`/api/assets/${id}`)).body.diasParaDevolver;

describe('a ficha do computador', () => {
  it('conta os dias até a devolução prevista, e o dia do prazo é zero', async () => {
    expect(await diasParaDevolver(await entregarComPrazo(diaNoBrasil(5)))).toBe(5);
    expect(await diasParaDevolver(await entregarComPrazo(diaNoBrasil(0)))).toBe(0);
  });

  it('o prazo que passou conta para trás', async () => {
    const id = await entregarComPrazo(diaNoBrasil(0));
    await prisma.assignment.updateMany({
      where: { assetId: id, checkinAt: null },
      data: { expectedCheckinAt: new Date(`${diaNoBrasil(-3)}T00:00:00.000Z`) },
    });

    expect(await diasParaDevolver(id)).toBe(-3);
  });

  it('sem prazo, ou sem entrega, não há conta', async () => {
    expect(await diasParaDevolver(await entregarComPrazo())).toBeNull();

    const { id } = await criarAtivo(api, { statusId: cenario.statusDeployableId, modelId: cenario.modelId });
    expect(await diasParaDevolver(id)).toBeNull();
  });
});
