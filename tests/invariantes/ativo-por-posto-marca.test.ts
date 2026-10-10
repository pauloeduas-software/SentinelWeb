import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../server/core/database/prismaClient';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import { criarAtivo, criarFabricante, criarModelo, idsDoSeed } from '../helpers/fixtures';

// INVARIANTE 19 — a porta da MARCA: marcar o local como posto de trabalho.
//
// As outras duas defendem a entrega e a restauração. Esta defende a MARCA: sem
// ela, uma sala de reunião com dois ativos virava posto em uma requisição, e a
// invariante ficava falsa no banco sem nada ter falhado.
//
// A regra é "no máximo um", então marcar uma sala que já tem UM ativo é
// legítimo — é como um posto nasce com o equipamento já lá.

let api: ApiDeTeste;
let seed: Awaited<ReturnType<typeof idsDoSeed>>;
let modelId: string;
let contador = 0;

beforeAll(async () => {
  api = await criarApi();
  seed = await idsDoSeed();
  const fabricanteId = await criarFabricante(api, 'Fabricante da Marca');
  modelId = await criarModelo(api, { categoriaId: seed.categoriaId, fabricanteId });
});

afterAll(async () => {
  await api.fechar();
});

/** Uma sala SEM a marca, pelo Prisma: o cadastro dela não é o que está sob teste. */
async function sala(name: string) {
  const criada = await prisma.location.create({
    data: { name, isWorkstation: false },
    select: { id: true },
  });
  return criada.id;
}

/** Um ativo já entregue ao local. */
async function ativoEntregueA(locationId: string, nome: string) {
  contador += 1;
  const ativo = await criarAtivo(api, {
    statusId: seed.statusDeployableId,
    modelId,
    name: nome,
    assetTag: `MARCA-${String(contador).padStart(3, '0')}`,
  });

  const entrega = await api.post(`/api/assets/${ativo.id}/checkout`, {
    targetType: 'LOCATION',
    targetLocationId: locationId,
  });
  expect(entrega.status, `entrega de ${nome} falhou: ${JSON.stringify(entrega.body)}`).toBe(201);

  return ativo;
}

function marcarComoPosto(locationId: string, name: string) {
  return api.put<{ error: string; ativos?: number }>(`/api/locations/${locationId}`, {
    name,
    isWorkstation: true,
  });
}

describe('invariante 19 — a porta da marca de posto de trabalho', () => {
  it('recusa com 409 marcar um local que já tem DOIS ativos', async () => {
    const id = await sala('Sala com dois ativos');
    await ativoEntregueA(id, 'Desktop A');
    await ativoEntregueA(id, 'Desktop B');

    const { status, body } = await marcarComoPosto(id, 'Sala com dois ativos');

    expect(status).toBe(409);
    expect(body.error).toMatch(/2 ativos/);
    expect(body.error).toMatch(/no máximo um/i);
    expect(body.ativos).toBe(2);

    // E nada foi gravado: a transação inteira voltou atrás.
    const depois = await prisma.location.findUniqueOrThrow({
      where: { id },
      select: { isWorkstation: true },
    });
    expect(depois.isWorkstation).toBe(false);
  });

  it('aceita marcar um local que tem UM ativo: é como um posto nasce', async () => {
    const id = await sala('Sala com um ativo');
    await ativoEntregueA(id, 'Desktop único');

    const { status } = await marcarComoPosto(id, 'Sala com um ativo');
    expect(status).toBe(200);

    const depois = await prisma.location.findUniqueOrThrow({
      where: { id },
      select: { isWorkstation: true },
    });
    expect(depois.isWorkstation).toBe(true);
  });

  it('aceita marcar um local VAZIO', async () => {
    const vazio = await sala('Sala vazia');
    expect((await marcarComoPosto(vazio, 'Sala vazia')).status).toBe(200);
  });

  it('ativo na LIXEIRA não conta: a sala com um vivo e um apagado vira posto', async () => {
    // O `delete-asset` só carimba `deletedAt` e NÃO fecha a posse, e a
    // `softDeleteExtension` não alcança filtro de relação aninhado — o topo da
    // consulta é `assignment`. Sem o `deletedAt: null` no contador, esta sala
    // contaria DOIS e nunca mais viraria posto, por causa de um ativo que
    // nenhuma tela mostra.
    const id = await sala('Sala com um na lixeira');
    const vivo = await ativoEntregueA(id, 'Desktop vivo');
    const apagado = await ativoEntregueA(id, 'Desktop apagado');
    expect((await api.delete(`/api/assets/${apagado.id}`)).status).toBe(200);

    const { status } = await marcarComoPosto(id, 'Sala com um na lixeira');
    expect(status).toBe(200);

    // E o que ficou é o vivo: o posto nasce com UM ativo.
    const quantos = await prisma.assignment.count({
      where: { targetLocationId: id, checkinAt: null, asset: { deletedAt: null } },
    });
    expect(quantos).toBe(1);
    expect(vivo.id).not.toBe(apagado.id);
  });

  it('um PUT que não menciona a marca não dispara a guarda', async () => {
    // A guarda só vale na TRANSIÇÃO: renomear uma sala com dois ativos continua
    // funcionando, porque ela não vira posto por isso.
    const id = await sala('Sala a renomear');
    await ativoEntregueA(id, 'Desktop renomeia A');
    await ativoEntregueA(id, 'Desktop renomeia B');

    const { status } = await api.put(`/api/locations/${id}`, { name: 'Sala renomeada' });
    expect(status).toBe(200);
  });
});
