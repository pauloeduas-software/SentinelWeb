import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../server/core/database/prismaClient';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import { criarAtivo, criarFabricante, criarModelo, idsDoSeed } from '../helpers/fixtures';

// O VÍNCULO MÁQUINA↔ATIVO DISPUTADO.
//
// A trava do ativo não cobria a máquina: dois vínculos da mesma máquina para
// ativos diferentes passavam os dois, e o segundo apagava o primeiro sem
// UNLINK nenhum na auditoria. O que estes testes provam é a trava da MÁQUINA.

let api: ApiDeTeste;
let seed: Awaited<ReturnType<typeof idsDoSeed>>;
let modelId: string;
let contador = 0;

beforeAll(async () => {
  api = await criarApi();
  seed = await idsDoSeed();
  const fabricanteId = await criarFabricante(api, 'Fabricante da Corrida do Vínculo');
  modelId = await criarModelo(api, { categoriaId: seed.categoriaId, fabricanteId });
});

afterAll(async () => {
  await api.fechar();
});

async function ativo() {
  contador += 1;
  return criarAtivo(api, { statusId: seed.statusDeployableId, modelId, assetTag: `CV-${String(contador).padStart(3, '0')}` });
}

async function maquina(hwid: string) {
  return prisma.endpoint.create({
    data: { hwid, hostname: `pc-${hwid}`, osVersion: 'Windows 11' },
    select: { id: true },
  });
}

/** Quantas respostas de cada status — é a única forma da asserção de corrida. */
function placar(respostas: { status: number }[]): Record<number, number> {
  const contagem: Record<number, number> = {};
  for (const r of respostas) contagem[r.status] = (contagem[r.status] ?? 0) + 1;
  return contagem;
}

describe('dois vínculos da MESMA máquina para ativos diferentes, ao mesmo tempo', () => {
  it('passa um só, e a auditoria tem um LINK só', async () => {
    const [a, b] = await Promise.all([ativo(), ativo()]);
    const pc = await maquina('corrida-link');

    const respostas = await Promise.all([
      api.post(`/api/endpoints/${pc.id}/link`, { assetId: a.id }),
      api.post(`/api/endpoints/${pc.id}/link`, { assetId: b.id }),
    ]);

    expect(placar(respostas)).toEqual({ 201: 1, 409: 1 });

    const vencedor = respostas[0].status === 201 ? a.id : b.id;
    expect((await prisma.endpoint.findUniqueOrThrow({ where: { id: pc.id } })).assetId).toBe(vencedor);
    expect(await prisma.auditLog.count({
      where: { action: 'LINK', entityId: { in: [a.id, b.id] } },
    })).toBe(1);
  });
});

describe('duas desvinculações da mesma máquina, ao mesmo tempo', () => {
  it('passa uma só, e a auditoria tem um UNLINK só', async () => {
    const a = await ativo();
    const pc = await maquina('corrida-unlink');
    expect((await api.post(`/api/endpoints/${pc.id}/link`, { assetId: a.id })).status).toBe(201);

    const respostas = await Promise.all([
      api.delete(`/api/endpoints/${pc.id}/link`),
      api.delete(`/api/endpoints/${pc.id}/link`),
    ]);

    expect(placar(respostas)).toEqual({ 200: 1, 409: 1 });
    expect(await prisma.auditLog.count({ where: { action: 'UNLINK', entityId: a.id } })).toBe(1);
  });
});

describe('dois aceites da MESMA sugestão, ao mesmo tempo', () => {
  it('passa um só: a sugestão fica aceita, e a auditoria tem um LINK só', async () => {
    contador += 1;
    const serial = `SN-ACEITE-${contador}`;
    const a = await criarAtivo(api, { statusId: seed.statusDeployableId, modelId, serial, assetTag: `CV-${String(contador).padStart(3, '0')}` });
    const pc = await prisma.endpoint.create({
      data: { hwid: 'corrida-aceite', hostname: 'pc-corrida-aceite', osVersion: 'Windows 11', biosSerial: serial },
      select: { id: true },
    });
    expect((await api.post('/api/reconciliation/run', {})).status).toBe(200);
    const sugestao = await prisma.reconciliationSuggestion.findFirstOrThrow({
      where: { endpointId: pc.id, state: 'PENDING' },
    });

    const respostas = await Promise.all([
      api.post(`/api/reconciliation/suggestions/${sugestao.id}/accept`, {}),
      api.post(`/api/reconciliation/suggestions/${sugestao.id}/accept`, {}),
    ]);

    expect(placar(respostas)).toEqual({ 200: 1, 409: 1 });
    expect((await prisma.reconciliationSuggestion.findUniqueOrThrow({ where: { id: sugestao.id } })).state)
      .toBe('ACCEPTED');
    expect(await prisma.auditLog.count({ where: { action: 'LINK', entityId: a.id } })).toBe(1);
  });
});
