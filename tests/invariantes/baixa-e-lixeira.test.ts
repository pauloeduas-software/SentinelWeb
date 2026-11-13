import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import { cenarioDePosse, criarAtivo, motivoDaBaixa } from '../helpers/fixtures';
import { prisma } from '../../server/infra/database/prismaClient';

// A BAIXA E A LIXEIRA (CL) — invariantes 26 e 20.
//
// O baixado não vai para a lixeira: a lixeira é cadastro errado, e a baixa é
// fato. E o computador com máquina vinculada não sai por nenhuma das duas: a
// máquina seguiria mandando telemetria e recebendo comando de quem saiu.

let api: ApiDeTeste;
let cenario: Awaited<ReturnType<typeof cenarioDePosse>>;

beforeAll(async () => {
  api = await criarApi();
  cenario = await cenarioDePosse(api, ' (baixa e lixeira)');
});

afterAll(async () => {
  await api.fechar();
});

const computador = (name: string) => criarAtivo(api, { statusId: cenario.statusDeployableId, modelId: cenario.modelId, name });

async function baixado(name: string) {
  const ativo = await computador(name);
  expect((await api.post(`/api/assets/${ativo.id}/retire`, { retiredReasonId: await motivoDaBaixa() })).status).toBe(200);
  return ativo;
}

async function comMaquina(name: string, hostname: string) {
  const ativo = await computador(name);
  const maquina = await prisma.endpoint.create({ data: { hwid: randomUUID(), hostname, osVersion: 'Windows 11' } });
  expect((await api.post(`/api/endpoints/${maquina.id}/link`, { assetId: ativo.id })).status).toBe(201);
  return { ativo, maquina };
}

describe('invariante 26 — o baixado não vai para a lixeira', () => {
  it('excluir o baixado é 409, e ele continua baixado', async () => {
    const ativo = await baixado('Vendido que não vai para a lixeira');

    const { status, body } = await api.delete<{ error: string }>(`/api/assets/${ativo.id}`);
    expect(status).toBe(409);
    expect(body.error).toBe(`${ativo.assetTag} teve baixa e não vai para a lixeira. Reverta a baixa antes.`);

    const linha = await prisma.asset.findUniqueOrThrow({ where: { id: ativo.id }, select: { retiredAt: true, deletedAt: true } });
    expect(linha.retiredAt).not.toBeNull();
    expect(linha.deletedAt).toBeNull();
  });

  it('os dois caminhos continuam: reverter e excluir, restaurar e dar baixa', async () => {
    const engano = await baixado('Baixa feita por engano');
    expect((await api.post(`/api/assets/${engano.id}/unretire`)).status).toBe(200);
    expect((await api.delete(`/api/assets/${engano.id}`)).status).toBe(200);

    const vendido = await computador('Excluído que foi vendido');
    expect((await api.delete(`/api/assets/${vendido.id}`)).status).toBe(200);
    expect((await api.post(`/api/assets/${vendido.id}/restore`)).status).toBe(200);
    expect((await api.post(`/api/assets/${vendido.id}/retire`, { retiredReasonId: await motivoDaBaixa() })).status).toBe(200);
  });

  it('quem escreve por fora da API leva o erro do CHECK', async () => {
    const ativo = await baixado('Baixado excluído à mão');

    await expect(prisma.$executeRaw`UPDATE assets SET "deletedAt" = now() WHERE id = ${ativo.id}::uuid`)
      .rejects.toThrow(/assets_baixado_fora_da_lixeira/);
  });
});

describe('invariante 20 — o computador com máquina vinculada não sai', () => {
  it('a baixa é 409, com a máquina em link; desvinculada, passa', async () => {
    const { ativo, maquina } = await comMaquina('Com máquina, sem baixa', 'PC-DA-BAIXA');

    const recusa = await api.post<{ error: string; refs: unknown[] }>(`/api/assets/${ativo.id}/retire`, {
      retiredReasonId: await motivoDaBaixa(),
    });
    expect(recusa.status).toBe(409);
    expect(recusa.body.error).toBe(
      `${ativo.assetTag} ainda tem a máquina PC-DA-BAIXA vinculada. Desvincule pela tela de Descobertas antes de dar baixa.`,
    );
    expect(recusa.body.refs).toEqual([{ tipo: 'maquina', id: maquina.id, nome: 'PC-DA-BAIXA' }]);

    expect((await api.delete(`/api/endpoints/${maquina.id}/link`)).status).toBe(200);
    expect((await api.post(`/api/assets/${ativo.id}/retire`, { retiredReasonId: await motivoDaBaixa() })).status).toBe(200);
  });

  it('a lixeira também', async () => {
    const { ativo, maquina } = await comMaquina('Com máquina, fora da lixeira', 'PC-DA-LIXEIRA');

    const recusa = await api.delete<{ error: string; refs: unknown[] }>(`/api/assets/${ativo.id}`);
    expect(recusa.status).toBe(409);
    expect(recusa.body.error).toBe(
      'Este computador ainda tem a máquina PC-DA-LIXEIRA vinculada. Desvincule pela tela de Descobertas antes de excluir.',
    );
    expect(recusa.body.refs).toEqual([{ tipo: 'maquina', id: maquina.id, nome: 'PC-DA-LIXEIRA' }]);
    expect((await prisma.endpoint.findUniqueOrThrow({ where: { id: maquina.id } })).assetId).toBe(ativo.id);

    expect((await api.delete(`/api/endpoints/${maquina.id}/link`)).status).toBe(200);
    expect((await api.delete(`/api/assets/${ativo.id}`)).status).toBe(200);
  });
});
