import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import { criarAtivo, criarFabricante, criarModelo, idsDoSeed, motivoDaBaixa } from '../helpers/fixtures';
import { prisma } from '../../server/infra/database/prismaClient';

// OS MOTIVOS DA BAIXA (BE) — um cadastro de Configurações, e não uma lista fechada.
//
// Nenhuma regra decide pelo motivo. O que importa provar é o que o cadastro
// poderia quebrar: a baixa aceitar um motivo que não existe, um motivo em uso
// sumir, e o histórico depender do nome de hoje.

let api: ApiDeTeste;
let statusId = '';
let modelId = '';

async function novoComputador() {
  return criarAtivo(api, { statusId, modelId });
}

async function novoMotivo(name: string): Promise<string> {
  const criado = await api.post<{ id: string }>('/api/retire-reasons', { name });
  expect(criado.status, JSON.stringify(criado.body)).toBe(201);
  return criado.body.id;
}

beforeAll(async () => {
  api = await criarApi();
  const seed = await idsDoSeed();
  statusId = seed.statusDeployableId;
  const fabricanteId = await criarFabricante(api);
  modelId = await criarModelo(api, { categoriaId: seed.categoriaId, fabricanteId });
});

afterAll(async () => {
  await api.fechar();
});

describe('o cadastro', () => {
  it('nasce com os seis motivos de sempre', async () => {
    const { body } = await api.get<{ name: string }[]>('/api/retire-reasons/options');
    expect(body.map((motivo) => motivo.name)).toEqual(expect.arrayContaining([
      'Vendido', 'Descartado', 'Doado', 'Devolvido em garantia', 'Extraviado', 'Roubado',
    ]));
  });

  it('o nome é único sem diferença de maiúscula, no cadastro e na edição', async () => {
    const { status } = await api.post('/api/retire-reasons', { name: 'vendido' });
    expect(status).toBe(409);

    const id = await novoMotivo('Motivo que tenta virar outro');
    expect((await api.put(`/api/retire-reasons/${id}`, { name: 'VENDIDO' })).status).toBe(409);
  });

  it('nome vazio ou só de espaços é 422, e a recusa é em português', async () => {
    for (const name of ['', '   ']) {
      const { status, body } = await api.post<{ error: string }>('/api/retire-reasons', { name });
      expect(status).toBe(422);
      expect(body.error).toMatch(/nome não pode ser vazio/);
    }
  });

  it('só tem nome: campo a mais é 422', async () => {
    const { status } = await api.post('/api/retire-reasons', { name: 'Motivo com notas', notes: 'texto' });
    expect(status).toBe(422);
  });

  it('o formulário velho leva 409, e nada é gravado (AF)', async () => {
    const criado = await api.post<{ id: string; updatedAt: string }>('/api/retire-reasons', { name: 'Motivo da versão' });
    const { id, updatedAt: lida } = criado.body;
    expect((await api.put(`/api/retire-reasons/${id}`, { name: 'Motivo de outra pessoa' })).status).toBe(200);

    const velha = await api.put(`/api/retire-reasons/${id}`, { name: 'Motivo do formulário velho', updatedAt: lida });
    expect(velha.status).toBe(409);
    const lido = await prisma.retireReason.findUniqueOrThrow({ where: { id }, select: { name: true } });
    expect(lido.name).toBe('Motivo de outra pessoa');
  });
});

describe('a baixa', () => {
  it('aceita o motivo que a empresa cadastrou, e a ficha mostra o nome', async () => {
    const ativo = await novoComputador();
    const retiredReasonId = await novoMotivo('Devolvido ao locador');

    const baixa = await api.post<{ retiredReason: { name: string } }>(`/api/assets/${ativo.id}/retire`, { retiredReasonId });
    expect(baixa.status, JSON.stringify(baixa.body)).toBe(200);
    expect(baixa.body.retiredReason.name).toBe('Devolvido ao locador');
  });

  it('recusa o motivo que não existe, e o computador continua no patrimônio', async () => {
    const ativo = await novoComputador();
    const { status, body } = await api.post<{ error: string }>(`/api/assets/${ativo.id}/retire`, {
      retiredReasonId: '00000000-0000-4000-8000-000000000000',
    });
    expect(status).toBe(404);
    expect(body.error).toMatch(/motivo/i);

    const lido = await prisma.asset.findUniqueOrThrow({ where: { id: ativo.id }, select: { retiredAt: true } });
    expect(lido.retiredAt).toBeNull();
  });

  it('sem motivo é 422, e a recusa diz o campo', async () => {
    const ativo = await novoComputador();
    const { status, body } = await api.post<{ error: string }>(`/api/assets/${ativo.id}/retire`, {});
    expect(status).toBe(422);
    expect(body.error).toMatch(/motivo da baixa: campo obrigatório/);
  });

  it('não recebe mais o valor da lista fechada: `retiredReason` no corpo é 422', async () => {
    const ativo = await novoComputador();
    const { status } = await api.post(`/api/assets/${ativo.id}/retire`, { retiredReason: 'VENDIDO' });
    expect(status).toBe(422);
  });
});

describe('o motivo em uso', () => {
  it('não sai, conta o baixado na lixeira, e sai depois de reverter a baixa', async () => {
    const ativo = await novoComputador();
    const id = await novoMotivo('Motivo em uso');
    expect((await api.post(`/api/assets/${ativo.id}/retire`, { retiredReasonId: id })).status).toBe(200);
    expect((await api.delete(`/api/assets/${ativo.id}`)).status).toBeLessThan(300);

    const recusa = await api.delete<{ error: string }>(`/api/retire-reasons/${id}`);
    expect(recusa.status).toBe(409);
    expect(recusa.body.error).toMatch(/1 registro/);

    expect((await api.post(`/api/assets/${ativo.id}/restore`)).status).toBe(200);
    expect((await api.post(`/api/assets/${ativo.id}/unretire`, {})).status).toBe(200);
    expect((await api.delete(`/api/retire-reasons/${id}`)).status).toBe(200);
  });

  it('a lista mostra o número que recusaria o Excluir', async () => {
    const ativo = await novoComputador();
    const name = 'Motivo contado';
    const id = await novoMotivo(name);
    await api.post(`/api/assets/${ativo.id}/retire`, { retiredReasonId: id });

    const { body } = await api.get<{ rows: { id: string; usos: number }[] }>(`/api/retire-reasons?q=${encodeURIComponent(name)}`);
    expect(body.rows.find((motivo) => motivo.id === id)?.usos).toBe(1);
  });
});

describe('o histórico', () => {
  it('renomear muda a ficha, e a auditoria continua com o nome da época, por escrito', async () => {
    const ativo = await novoComputador();
    const id = await novoMotivo('Nome antigo do motivo');
    expect((await api.post(`/api/assets/${ativo.id}/retire`, { retiredReasonId: id })).status).toBe(200);
    expect((await api.put(`/api/retire-reasons/${id}`, { name: 'Nome novo do motivo' })).status).toBe(200);

    const { body } = await api.get<{ retiredReason: { name: string } }>(`/api/assets/${ativo.id}`);
    expect(body.retiredReason.name).toBe('Nome novo do motivo');

    const linha = await prisma.auditLog.findFirstOrThrow({
      where: { entityId: ativo.id, action: 'RETIRE' },
      select: { changes: true },
    });
    expect(linha.changes).toMatchObject({ retiredReason: { de: null, para: 'Nome antigo do motivo' } });
  });

  it('reverter guarda de que motivo ele voltou, e excluir o baixado guarda o motivo no retrato', async () => {
    const ativo = await novoComputador();
    const retiredReasonId = await motivoDaBaixa('Doado');
    await api.post(`/api/assets/${ativo.id}/retire`, { retiredReasonId });
    await api.post(`/api/assets/${ativo.id}/unretire`, {});

    const volta = await prisma.auditLog.findFirstOrThrow({
      where: { entityId: ativo.id, action: 'UNRETIRE' },
      select: { changes: true },
    });
    expect(volta.changes).toMatchObject({ retiredReason: { de: 'Doado', para: null } });

    await api.post(`/api/assets/${ativo.id}/retire`, { retiredReasonId });
    await api.delete(`/api/assets/${ativo.id}`);
    const retrato = await prisma.auditLog.findFirstOrThrow({
      where: { entityId: ativo.id, action: 'DELETE' },
      select: { changes: true },
    });
    expect(JSON.stringify(retrato.changes)).toContain('Doado');
  });
});
