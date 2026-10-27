import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../server/core/database/prismaClient';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import {
  criarAtivo, criarColaborador, criarFabricante, criarItemDeEstoque, criarLocal, criarModelo, criarPosto, idsDoSeed,
} from '../helpers/fixtures';

// O POSTO: o cadastro, o que segura o delete e o que a desativação fecha.
//
// O posto segue a regra do status (decisão Y): nome único, desativar em vez de
// excluir, e só o que está nele AGORA segura o delete — entrega ou saída
// aberta, ocupante atual. O passado não segura: a entrega devolvida e a
// ocupação encerrada perdem a ligação e guardam o nome por escrito, e o
// histórico continua dizendo onde o ativo esteve. Desativado, ele some das
// escolhas e não recebe nada novo.

let api: ApiDeTeste;
let seed: Awaited<ReturnType<typeof idsDoSeed>>;
let modelId = '';
let laura = '';
let filial = '';

beforeAll(async () => {
  api = await criarApi();
  seed = await idsDoSeed();
  const fabricanteId = await criarFabricante(api, 'Fabricante dos Postos');
  modelId = await criarModelo(api, { categoriaId: seed.categoriaId, fabricanteId });
  laura = await criarColaborador(api, { name: 'Laura dos Postos', email: 'laura.postos@teste.local' });
  filial = await criarLocal(api, { name: 'Filial dos Postos' });
});

afterAll(async () => {
  await api.fechar();
});

const ativoDisponivel = (name: string) => criarAtivo(api, { statusId: seed.statusDeployableId, modelId, name });

const posto = (name: string) => criarPosto(api, { name, locationId: filial });

async function desativar(id: string) {
  const resposta = await api.put(`/api/workstations/${id}`, { isActive: false });
  expect(resposta.status, JSON.stringify(resposta.body)).toBe(200);
}

describe('o cadastro do posto', () => {
  it('nasce numa localização, e a listagem diz qual', async () => {
    const mesa = await posto('Mesa da listagem de postos');

    const { body } = await api.get<{ rows: { id: string; location: { id: string; name: string } }[] }>(
      '/api/workstations?q=listagem%20de%20postos',
    );
    expect(body.rows.find((linha) => linha.id === mesa)?.location).toEqual({ id: filial, name: 'Filial dos Postos' });
  });

  it('sem localização é 422; com localização que não existe, 404', async () => {
    expect((await api.post('/api/workstations', { name: 'Mesa sem lugar' })).status).toBe(422);

    const inexistente = await api.post('/api/workstations', {
      name: 'Mesa em lugar nenhum', locationId: '00000000-0000-4000-8000-000000000000',
    });
    expect(inexistente.status).toBe(404);
  });

  it('o nome é único, sem diferença de maiúscula', async () => {
    await posto('Mesa Única');
    const { status, body } = await api.post<{ error: string }>('/api/workstations', {
      name: 'mesa única', locationId: filial,
    });
    expect(status).toBe(409);
    expect(body.error).toMatch(/Já existe posto com o nome/);
  });
});

describe('excluir posto — só o presente segura', () => {
  it('recusa o que tem uma entrega ABERTA, e a dica diz o que tirar', async () => {
    const mesa = await posto('Mesa com desktop agora');
    const ativo = await ativoDisponivel('Desktop que está na mesa');
    expect((await api.post(`/api/assets/${ativo.id}/checkout`, {
      targetType: 'WORKSTATION', targetWorkstationId: mesa,
    })).status).toBe(201);

    const { status, body } = await api.delete<{ error: string }>(`/api/workstations/${mesa}`);
    expect(status).toBe(409);
    expect(body.error).toMatch(/^Este posto ainda tem 1 ativo\. /);
    expect(body.error).toContain('Tire o que está nele agora');
  });

  it('exclui o que só tem entrega JÁ DEVOLVIDA, e o histórico do ativo continua com o nome', async () => {
    const mesa = await posto('Mesa com entrega antiga');
    const ativo = await ativoDisponivel('Desktop que passou pela mesa');
    expect((await api.post(`/api/assets/${ativo.id}/checkout`, {
      targetType: 'WORKSTATION', targetWorkstationId: mesa,
    })).status).toBe(201);
    expect((await api.post(`/api/assets/${ativo.id}/checkin`, {})).status).toBe(200);

    expect((await api.delete(`/api/workstations/${mesa}`)).status).toBe(200);
    expect(await prisma.workstation.count({ where: { id: mesa } })).toBe(0);

    // A linha da posse perdeu a ligação e guardou o nome por escrito.
    const historico = await api.get<{ rows: { action: string; posse: { targetLabel: string | null } | null }[] }>(
      `/api/assets/${ativo.id}/history`,
    );
    const entrega = historico.body.rows.find((evento) => evento.action === 'CHECKOUT');
    expect(entrega?.posse?.targetLabel).toBe('Mesa com entrega antiga');
  });

  it('exclui o que só tem ocupante ENCERRADO, e a ficha da pessoa continua dizendo onde ela sentou', async () => {
    const mesa = await posto('Mesa com ocupação antiga');
    const ocupacao = await api.post<{ id: string }>(`/api/workstations/${mesa}/occupants`, { personId: laura, shift: 'Manhã' });
    expect(ocupacao.status).toBe(201);
    expect((await api.delete(`/api/workstations/${mesa}/occupants/${ocupacao.body.id}`)).status).toBe(200);

    expect((await api.delete(`/api/workstations/${mesa}`)).status).toBe(200);

    const historico = await api.get<{
      rows: { fonte: string; posto: { workstationId: string | null; workstationLabel: string } | null }[];
    }>(`/api/people/${laura}/history`);
    const doPosto = historico.body.rows.filter((evento) => evento.fonte === 'POSTO');
    expect(doPosto.length).toBeGreaterThan(0);
    for (const evento of doPosto) {
      expect(evento.posto?.workstationId).toBeNull();
      expect(evento.posto?.workstationLabel).toBe('Mesa com ocupação antiga');
    }
  });

  it('exclui o que só recebeu estoque JÁ DEVOLVIDO, e o histórico do item continua com o nome', async () => {
    const mesa = await posto('Mesa com mouse antigo');
    const mouse = await criarItemDeEstoque(api, { name: 'Mouse que passou pela mesa', categoryId: seed.categoriaEstoqueId, qty: 1 });
    const saida = await api.post<{ unidades: { id: string }[] }>(`/api/stock/items/${mouse.id}/checkout`, {
      targetType: 'WORKSTATION', targetWorkstationId: mesa, qty: 1,
    });
    expect(saida.status).toBe(201);
    expect((await api.post(`/api/stock/checkouts/${saida.body.unidades[0].id}/checkin`, {})).status).toBe(200);

    expect((await api.delete(`/api/workstations/${mesa}`)).status).toBe(200);

    const historico = await api.get<{ rows: { action: string; targetLabel: string }[] }>(
      `/api/stock/items/${mouse.id}/history`,
    );
    expect(historico.body.rows.map((evento) => [evento.action, evento.targetLabel])).toEqual([
      ['CHECKIN', 'Mesa com mouse antigo'], ['CHECKOUT', 'Mesa com mouse antigo'],
    ]);
  });

  it('apaga o que está vazio de verdade', async () => {
    const vazio = await posto('Mesa nunca usada');
    expect((await api.delete(`/api/workstations/${vazio}`)).status).toBe(200);
    expect(await prisma.workstation.count({ where: { id: vazio } })).toBe(0);
  });
});

describe('posto desativado não recebe nada NOVO', () => {
  it('some do /options — o seletor da entrega não o oferece', async () => {
    const ativo = await posto('Opção de Posto Ativo');
    const inativo = await posto('Opção de Posto Desativado');
    await desativar(inativo);

    const { status, body } = await api.get<{ id: string }[]>('/api/workstations/options?q=Op%C3%A7%C3%A3o%20de%20Posto');
    expect(status).toBe(200);
    const ids = body.map((o) => o.id);
    expect(ids).toContain(ativo);
    expect(ids).not.toContain(inativo);
  });

  it('recusa a entrega de ativo a ele', async () => {
    const mesa = await posto('Mesa fechada para entrega');
    await desativar(mesa);
    const ativo = await ativoDisponivel('Notebook barrado');

    const { status, body } = await api.post<{ error: string }>(`/api/assets/${ativo.id}/checkout`, {
      targetType: 'WORKSTATION', targetWorkstationId: mesa,
    });
    expect(status).toBe(409);
    expect(body.error).toMatch(/"Mesa fechada para entrega" está desativado e não recebe/);
    expect(await prisma.assignment.count({ where: { assetId: ativo.id } })).toBe(0);
  });

  it('recusa a saída de estoque para ele', async () => {
    const mesa = await posto('Mesa fechada para estoque');
    await desativar(mesa);
    const mouse = await criarItemDeEstoque(api, { name: 'Mouse barrado', categoryId: seed.categoriaEstoqueId, qty: 1 });

    const { status, body } = await api.post<{ error: string }>(`/api/stock/items/${mouse.id}/checkout`, {
      targetType: 'WORKSTATION', targetWorkstationId: mesa,
    });
    expect(status).toBe(409);
    expect(body.error).toMatch(/desativado/);
  });

  it('recusa ocupante novo', async () => {
    const mesa = await posto('Mesa fechada');
    await desativar(mesa);

    const { status, body } = await api.post<{ error: string }>(`/api/workstations/${mesa}/occupants`, {
      personId: laura, shift: 'Manhã',
    });
    expect(status).toBe(409);
    expect(body.error).toMatch(/desativado/);
  });
});
