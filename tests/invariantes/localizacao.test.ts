import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../server/core/database/prismaClient';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import {
  criarAtivo, criarColaborador, criarFabricante, criarItemDeEstoque, criarLocal, criarModelo, idsDoSeed,
} from '../helpers/fixtures';

// A LOCALIZAÇÃO: o que segura o delete, e o que a desativação fecha.
//
// Localização não tem lixeira — sai de vez ou não sai. Por isso o histórico
// inteiro conta como uso: a entrega devolvida e a ocupação encerrada respondem
// "quem respondia pela Mesa 1 em março", e as duas FKs são `Restrict`. Local
// com qualquer passado se DESATIVA: some das escolhas, continua no histórico e
// não recebe nada novo — mas o que já aponta para ele continua editável.

let api: ApiDeTeste;
let seed: Awaited<ReturnType<typeof idsDoSeed>>;
let modelId = '';
let laura = '';

beforeAll(async () => {
  api = await criarApi();
  seed = await idsDoSeed();
  const fabricanteId = await criarFabricante(api, 'Fabricante das Localizações');
  modelId = await criarModelo(api, { categoriaId: seed.categoriaId, fabricanteId });
  laura = await criarColaborador(api, { name: 'Laura das Localizações', email: 'laura.local@teste.local' });
});

afterAll(async () => {
  await api.fechar();
});

const ativoDisponivel = (name: string, locationId?: string) =>
  criarAtivo(api, { statusId: seed.statusDeployableId, modelId, name, locationId });

async function desativar(id: string) {
  const resposta = await api.put(`/api/locations/${id}`, { isActive: false });
  expect(resposta.status, JSON.stringify(resposta.body)).toBe(200);
}

describe('excluir localização — o histórico segura', () => {
  it('recusa a que só tem ocupante ENCERRADO, e sugere desativar', async () => {
    const mesa = await criarLocal(api, { name: 'Mesa com ocupação antiga', isWorkstation: true });
    const ocupacao = await api.post<{ id: string }>(`/api/locations/${mesa}/occupants`, { userId: laura, shift: 'Manhã' });
    expect(ocupacao.status).toBe(201);
    expect((await api.delete(`/api/locations/${mesa}/occupants/${ocupacao.body.id}`)).status).toBe(200);

    const { status, body } = await api.delete<{ error: string; emUso: number }>(`/api/locations/${mesa}`);
    expect(status).toBe(409);
    expect(body.emUso).toBe(1);
    // A recusa ensina a saída — sem a dica, o operador fica sem caminho.
    expect(body.error).toContain('Desative-a em vez de excluir');
  });

  it('recusa a que só tem entrega JÁ DEVOLVIDA', async () => {
    const sala = await criarLocal(api, { name: 'Sala com entrega antiga' });
    const ativo = await ativoDisponivel('Projetor que passou pela sala');
    expect((await api.post(`/api/assets/${ativo.id}/checkout`, {
      targetType: 'LOCATION', targetLocationId: sala,
    })).status).toBe(201);
    expect((await api.post(`/api/assets/${ativo.id}/checkin`, {})).status).toBe(200);

    const { status, body } = await api.delete<{ emUso: number }>(`/api/locations/${sala}`);
    expect(status).toBe(409);
    expect(body.emUso).toBe(1);
  });

  it('apaga a que está vazia de verdade', async () => {
    const vazia = await criarLocal(api, { name: 'Sala nunca usada' });
    expect((await api.delete(`/api/locations/${vazia}`)).status).toBe(200);
    expect(await prisma.location.count({ where: { id: vazia } })).toBe(0);
  });
});

describe('localização desativada não recebe nada NOVO', () => {
  it('some do /options — o formulário não a oferece', async () => {
    const ativa = await criarLocal(api, { name: 'Opção Ativa' });
    const inativa = await criarLocal(api, { name: 'Opção Desativada' });
    await desativar(inativa);

    const { status, body } = await api.get<{ id: string }[]>('/api/locations/options?q=Op%C3%A7%C3%A3o');
    expect(status).toBe(200);
    const ids = body.map((o) => o.id);
    expect(ids).toContain(ativa);
    expect(ids).not.toContain(inativa);
  });

  it('recusa a entrega de ativo a ela', async () => {
    const sala = await criarLocal(api, { name: 'Sala fechada para entrega' });
    await desativar(sala);
    const ativo = await ativoDisponivel('Notebook barrado');

    const { status, body } = await api.post<{ error: string }>(`/api/assets/${ativo.id}/checkout`, {
      targetType: 'LOCATION', targetLocationId: sala,
    });
    expect(status).toBe(409);
    expect(body.error).toMatch(/"Sala fechada para entrega" está desativada e não recebe/);
    expect(await prisma.assignment.count({ where: { assetId: ativo.id } })).toBe(0);
  });

  it('recusa a saída de estoque para ela', async () => {
    const sala = await criarLocal(api, { name: 'Sala fechada para estoque' });
    await desativar(sala);
    const mouse = await criarItemDeEstoque(api, { name: 'Mouse barrado', categoryId: seed.categoriaEstoqueId, qty: 1 });

    const { status, body } = await api.post<{ error: string }>(`/api/stock/items/${mouse.id}/checkout`, {
      targetType: 'LOCATION', targetLocationId: sala,
    });
    expect(status).toBe(409);
    expect(body.error).toMatch(/desativada/);
  });

  it('recusa ocupante novo', async () => {
    const mesa = await criarLocal(api, { name: 'Mesa fechada', isWorkstation: true });
    await desativar(mesa);

    const { status, body } = await api.post<{ error: string }>(`/api/locations/${mesa}/occupants`, {
      userId: laura, shift: 'Manhã',
    });
    expect(status).toBe(409);
    expect(body.error).toMatch(/desativada/);
  });

  it('recusa ativo NOVO cadastrado nela', async () => {
    const deposito = await criarLocal(api, { name: 'Depósito fechado' });
    await desativar(deposito);

    const { status, body } = await api.post<{ error: string }>('/api/assets', {
      statusId: seed.statusDeployableId, modelId, locationId: deposito,
    });
    expect(status).toBe(409);
    expect(body.error).toMatch(/desativada/);
  });

  it('deixa editar o ativo que JÁ está nela, sem mudar o local', async () => {
    // O formulário reenvia todo campo: recusar o `locationId` que não mudou
    // travaria a edição do nome de tudo que estava no depósito desativado.
    const deposito = await criarLocal(api, { name: 'Depósito antigo' });
    const ativo = await ativoDisponivel('Servidor do depósito', deposito);
    await desativar(deposito);

    const { status } = await api.put(`/api/assets/${ativo.id}`, { name: 'Servidor renomeado', locationId: deposito });
    expect(status).toBe(200);
  });
});

describe('a localização é uma lista plana', () => {
  it('recusa "Dentro de" e "Gestor" no corpo — os campos não existem mais', async () => {
    // `strictObject` na borda: campo desconhecido é 422, e não ignorado em
    // silêncio. Um cliente antigo que ainda mande o pai fica sabendo.
    const pai = await api.post('/api/locations', { name: 'Com pai', parentId: '00000000-0000-4000-8000-000000000000' });
    expect(pai.status).toBe(422);

    const gestor = await api.post('/api/locations', { name: 'Com gestor', managerId: '00000000-0000-4000-8000-000000000000' });
    expect(gestor.status).toBe(422);
  });
});

describe('o estoque guardado numa localização', () => {
  it('grava o local do item, e a localização que guarda estoque não se exclui', async () => {
    const deposito = await criarLocal(api, { name: 'Depósito da guarda' });
    const { status, body } = await api.post<{ id: string; locationId: string; location: { name: string } }>(
      '/api/stock/items', { name: 'Mouse guardado', categoryId: seed.categoriaEstoqueId, qty: 3, locationId: deposito },
    );
    expect(status).toBe(201);
    expect(body.location.name).toBe('Depósito da guarda');

    const exclusao = await api.delete<{ error: string }>(`/api/locations/${deposito}`);
    expect(exclusao.status).toBe(409);
    expect(exclusao.body.error).toMatch(/Desative-a em vez de excluir/);
  });

  it('localização desativada não recebe estoque novo — mas o item que já estava lá continua editável', async () => {
    const deposito = await criarLocal(api, { name: 'Depósito antigo de estoque' });
    const item = await api.post<{ id: string }>(
      '/api/stock/items', { name: 'Teclado guardado', categoryId: seed.categoriaEstoqueId, locationId: deposito },
    );
    await desativar(deposito);

    const novo = await api.post('/api/stock/items', { name: 'Cabo novo', categoryId: seed.categoriaEstoqueId, locationId: deposito });
    expect(novo.status).toBe(409);

    const edicao = await api.put(`/api/stock/items/${item.body.id}`, {
      name: 'Teclado guardado renomeado', categoryId: seed.categoriaEstoqueId, locationId: deposito,
    });
    expect(edicao.status).toBe(200);
  });
});
