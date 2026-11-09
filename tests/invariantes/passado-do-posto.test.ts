import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../server/infra/database/prismaClient';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import {
  criarAtivo, criarColaborador, criarFabricante, criarModelo, criarPosto, diaNoBrasil, idsDoSeed,
} from '../helpers/fixtures';

// O PASSADO DO POSTO (AX). A invariante 19 e a ocupação única olhavam só o
// presente, e a data passada da entrega e da ocupação voltava no tempo por cima
// de um período que já existia: um segundo computador na Mesa 1 em março, se o
// primeiro só saiu em junho, ou a Laura duas vezes na mesma mesa. É a regra que
// o computador já tinha consigo mesmo (a entrega não antecede a última
// devolução dele), lida pelo lado do posto e da ocupação.

let api: ApiDeTeste;
let seed: Awaited<ReturnType<typeof idsDoSeed>>;
let modelId = '';
let contador = 0;

beforeAll(async () => {
  api = await criarApi();
  seed = await idsDoSeed();
  const fabricanteId = await criarFabricante(api, 'Fabricante do Passado do Posto');
  modelId = await criarModelo(api, { categoriaId: seed.categoriaId, fabricanteId });
});

afterAll(async () => {
  await api.fechar();
});

async function ativo(nome: string) {
  contador += 1;
  return criarAtivo(api, {
    statusId: seed.statusDeployableId, modelId, name: nome, assetTag: `PASSADO-${String(contador).padStart(3, '0')}`,
  });
}

const entregarAoPosto = (assetId: string, workstationId: string, checkoutAt?: string) =>
  api.post<{ error?: string; assignment: { checkoutAt: string } }>(`/api/assets/${assetId}/checkout`, {
    targetType: 'WORKSTATION', targetWorkstationId: workstationId, checkoutAt,
  });

const ocupar = (workstationId: string, personId: string, startedAt?: string) =>
  api.post<{ id: string; error?: string; startedAt: string }>(`/api/workstations/${workstationId}/occupants`, {
    personId, startedAt,
  });

describe('um computador por posto também no passado', () => {
  it('a entrega não volta para antes da última devolução de outro computador no posto', async () => {
    const mesa = await criarPosto(api, { name: 'Mesa do Passado' });
    const primeiro = await ativo('Desktop que ficou até ontem');
    const segundo = await ativo('Desktop que chega depois');

    expect((await entregarAoPosto(primeiro.id, mesa, diaNoBrasil(-60))).status).toBe(201);
    expect((await api.post(`/api/assets/${primeiro.id}/checkin`, { checkinAt: diaNoBrasil(-10) })).status).toBe(200);

    // Março por cima de um período que já tinha computador.
    const antes = await entregarAoPosto(segundo.id, mesa, diaNoBrasil(-30));
    expect(antes.status).toBe(422);
    expect(antes.body.error).toContain('última devolução no posto Mesa do Passado');
    expect(antes.body.error).toContain(primeiro.assetTag);

    // No mesmo dia da devolução passa, e fica DEPOIS dela: a ordem do
    // histórico não inverte.
    const noDia = await entregarAoPosto(segundo.id, mesa, diaNoBrasil(-10));
    expect(noDia.status).toBe(201);
    const devolvida = await prisma.assignment.findFirstOrThrow({ where: { assetId: primeiro.id } });
    expect(new Date(noDia.body.assignment.checkoutAt).getTime()).toBeGreaterThan(devolvida.checkinAt!.getTime());
  });

  it('o passado de um posto não segura a entrega a outro posto, nem a uma pessoa', async () => {
    const mesa = await criarPosto(api, { name: 'Mesa do Passado 2' });
    const vizinha = await criarPosto(api, { name: 'Mesa Vizinha do Passado' });
    const laura = await criarColaborador(api, { name: 'Laura do Passado', email: 'laura.passado@teste.local' });
    const primeiro = await ativo('Desktop da Mesa 2');
    expect((await entregarAoPosto(primeiro.id, mesa, diaNoBrasil(-60))).status).toBe(201);
    expect((await api.post(`/api/assets/${primeiro.id}/checkin`, { checkinAt: diaNoBrasil(-10) })).status).toBe(200);

    expect((await entregarAoPosto((await ativo('Desktop da vizinha')).id, vizinha, diaNoBrasil(-30))).status).toBe(201);
    expect((await api.post(`/api/assets/${(await ativo('Notebook da Laura')).id}/checkout`, {
      targetType: 'PERSON', targetPersonId: laura, checkoutAt: diaNoBrasil(-30),
    })).status).toBe(201);
  });

  // A REDE DE BAIXO: a porta da entrega já recusa, então quem chega aqui é
  // quem escreve por fora. O índice é por posto, só na posse aberta.
  it('o banco recusa a segunda posse aberta no mesmo posto', async () => {
    const mesa = await criarPosto(api, { name: 'Mesa do Índice' });
    const primeiro = await ativo('Desktop do índice');
    const segundo = await ativo('Desktop por fora');
    expect((await entregarAoPosto(primeiro.id, mesa)).status).toBe(201);

    await expect(prisma.$executeRaw`
      INSERT INTO assignments (id, "assetId", "targetType", "targetWorkstationId", "updatedAt")
      VALUES (gen_random_uuid(), ${segundo.id}::uuid, 'WORKSTATION', ${mesa}::uuid, now())
    `).rejects.toThrow(/23505.*Key \(\\?"targetWorkstationId\\?"\)/s);

    // E é este índice, e não outro: o nome existe no banco, parcial na aberta.
    const [indice] = await prisma.$queryRaw<{ indexdef: string }[]>`
      SELECT indexdef FROM pg_indexes WHERE indexname = 'assignments_um_aberto_por_posto'
    `;
    expect(indice.indexdef).toMatch(/UNIQUE INDEX .*\("targetWorkstationId"\) WHERE \("checkinAt" IS NULL\)/);
  });
});

describe('a mesma pessoa no mesmo posto, um período depois do outro', () => {
  it('a ocupação nova não começa antes do fim da anterior da mesma pessoa', async () => {
    const mesa = await criarPosto(api, { name: 'Mesa da Volta' });
    const joana = await criarColaborador(api, { name: 'Joana da Volta', email: 'joana.volta@teste.local' });

    const primeira = await ocupar(mesa, joana, diaNoBrasil(-60));
    expect(primeira.status).toBe(201);
    expect((await api.delete(`/api/workstations/${mesa}/occupants/${primeira.body.id}`, {
      endedAt: diaNoBrasil(-10),
    })).status).toBe(200);

    // Ocupação 1 início · ocupação 2 · fim 1: não existe.
    const porCima = await ocupar(mesa, joana, diaNoBrasil(-30));
    expect(porCima.status).toBe(422);
    expect(porCima.body.error).toContain('antes da última saída de Joana da Volta');

    const noDia = await ocupar(mesa, joana, diaNoBrasil(-10));
    expect(noDia.status).toBe(201);
    const encerrada = await prisma.workstationOccupant.findUniqueOrThrow({ where: { id: primeira.body.id } });
    expect(new Date(noDia.body.startedAt).getTime()).toBeGreaterThan(encerrada.endedAt!.getTime());
  });

  it('outra pessoa no mesmo período é escala, e a mesma pessoa em outro posto também passa', async () => {
    const mesa = await criarPosto(api, { name: 'Mesa da Escala' });
    const outraMesa = await criarPosto(api, { name: 'Outra Mesa da Escala' });
    const pedro = await criarColaborador(api, { name: 'Pedro da Escala', email: 'pedro.escala@teste.local' });
    const ana = await criarColaborador(api, { name: 'Ana da Escala', email: 'ana.escala@teste.local' });

    const dele = await ocupar(mesa, pedro, diaNoBrasil(-60));
    expect((await api.delete(`/api/workstations/${mesa}/occupants/${dele.body.id}`, {
      endedAt: diaNoBrasil(-10),
    })).status).toBe(200);

    expect((await ocupar(mesa, ana, diaNoBrasil(-30))).status).toBe(201);
    expect((await ocupar(outraMesa, pedro, diaNoBrasil(-30))).status).toBe(201);
  });
});
