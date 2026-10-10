import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../server/core/database/prismaClient';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import { conectarAgente, esperarPor } from '../helpers/agente';
import { criarAtivo, criarFabricante, criarModelo, idsDoSeed } from '../helpers/fixtures';

// INVARIANTE 19 — a TERCEIRA porta: marcar o local como posto de trabalho.
//
// As duas primeiras defendem a escrita de posse e de vínculo. Esta defende a
// MARCA: sem ela, uma sala de reunião com dois computadores virava posto em uma
// requisição, e a invariante ficava falsa no banco sem nada ter falhado.
//
// A regra é "no máximo um", então marcar uma sala que já tem UM computador é
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

/** Uma sala SEM a marca, pelo Prisma: o teto de escrita é por arquivo. */
async function sala(name: string) {
  const criada = await prisma.location.create({
    data: { name, isWorkstation: false },
    select: { id: true },
  });
  return criada.id;
}

/** Um computador (ativo com máquina) já entregue ao local. */
async function computadorEntregueA(locationId: string, hwid: string) {
  contador += 1;
  const ativo = await criarAtivo(api, {
    statusId: seed.statusDeployableId,
    modelId,
    name: `Desktop ${hwid}`,
    assetTag: `MARCA-${String(contador).padStart(3, '0')}`,
  });

  const agente = await conectarAgente(api, hwid);
  await agente.handshake({ Hostname: `pc-${hwid}` });
  const maquina = await esperarPor(`a máquina ${hwid}`, () =>
    prisma.endpoint.findUnique({ where: { hwid } }));
  await agente.fechar();

  const vinculo = await api.post(`/api/endpoints/${maquina.id}/link`, { assetId: ativo.id });
  expect(vinculo.status, `vínculo de ${hwid} falhou: ${JSON.stringify(vinculo.body)}`).toBe(201);

  const entrega = await api.post(`/api/assets/${ativo.id}/checkout`, {
    targetType: 'LOCATION',
    targetLocationId: locationId,
  });
  expect(entrega.status, `entrega de ${hwid} falhou: ${JSON.stringify(entrega.body)}`).toBe(201);

  return ativo;
}

function marcarComoPosto(locationId: string, name: string) {
  return api.put<{ error: string; computadores?: number }>(`/api/locations/${locationId}`, {
    name,
    isWorkstation: true,
  });
}

describe('invariante 19 — a terceira porta: a marca de posto de trabalho', () => {
  it('recusa com 409 marcar um local que já tem DOIS computadores', async () => {
    const id = await sala('Sala com dois computadores');
    await computadorEntregueA(id, 'marca-dois-a');
    await computadorEntregueA(id, 'marca-dois-b');

    const { status, body } = await marcarComoPosto(id, 'Sala com dois computadores');

    expect(status).toBe(409);
    expect(body.error).toMatch(/2 computadores/);
    expect(body.error).toMatch(/no máximo um/i);
    expect(body.computadores).toBe(2);

    // E nada foi gravado: a transação inteira voltou atrás.
    const depois = await prisma.location.findUniqueOrThrow({
      where: { id },
      select: { isWorkstation: true },
    });
    expect(depois.isWorkstation).toBe(false);
  });

  it('aceita marcar um local que tem UM computador: é como um posto nasce', async () => {
    const id = await sala('Sala com um computador');
    await computadorEntregueA(id, 'marca-um-a');

    const { status } = await marcarComoPosto(id, 'Sala com um computador');
    expect(status).toBe(200);

    const depois = await prisma.location.findUniqueOrThrow({
      where: { id },
      select: { isWorkstation: true },
    });
    expect(depois.isWorkstation).toBe(true);
  });

  it('aceita marcar um local VAZIO, e um com monitor sem máquina', async () => {
    const vazio = await sala('Sala vazia');
    expect((await marcarComoPosto(vazio, 'Sala vazia')).status).toBe(200);

    // Monitor não é computador: entra sem limite e não impede a marca.
    const comMonitor = await sala('Sala com monitores');
    for (const n of [1, 2]) {
      contador += 1;
      const monitor = await criarAtivo(api, {
        statusId: seed.statusDeployableId,
        modelId,
        name: `Monitor ${n}`,
        assetTag: `MARCA-${String(contador).padStart(3, '0')}`,
      });
      const entrega = await api.post(`/api/assets/${monitor.id}/checkout`, {
        targetType: 'LOCATION',
        targetLocationId: comMonitor,
      });
      expect(entrega.status).toBe(201);
    }

    expect((await marcarComoPosto(comMonitor, 'Sala com monitores')).status).toBe(200);
  });

  it('computador na LIXEIRA não conta: a sala com um vivo e um apagado vira posto', async () => {
    // O `delete-asset` só carimba `deletedAt` e NÃO fecha a posse, e a
    // `softDeleteExtension` não alcança filtro de relação aninhado — o topo da
    // consulta é `assignment`. Sem o `deletedAt: null` no contador, esta sala
    // contaria DOIS e nunca mais viraria posto, por causa de um ativo que
    // nenhuma tela mostra.
    const id = await sala('Sala com um na lixeira');
    const vivo = await computadorEntregueA(id, 'marca-lixeira-vivo');
    const apagado = await computadorEntregueA(id, 'marca-lixeira-apagado');
    expect((await api.delete(`/api/assets/${apagado.id}`)).status).toBe(200);

    const { status } = await marcarComoPosto(id, 'Sala com um na lixeira');
    expect(status).toBe(200);

    // E o que ficou é o vivo: o posto nasce com UM computador.
    const quantos = await prisma.assignment.count({
      where: { targetLocationId: id, checkinAt: null, asset: { deletedAt: null } },
    });
    expect(quantos).toBe(1);
    expect(vivo.id).not.toBe(apagado.id);
  });

  it('um PUT que não menciona a marca não dispara a guarda', async () => {
    // A guarda só vale na TRANSIÇÃO: renomear uma sala com dois computadores
    // continua funcionando, porque ela não vira posto por isso.
    const id = await sala('Sala a renomear');
    await computadorEntregueA(id, 'marca-renomeia-a');
    await computadorEntregueA(id, 'marca-renomeia-b');

    const { status } = await api.put(`/api/locations/${id}`, { name: 'Sala renomeada' });
    expect(status).toBe(200);
  });
});
