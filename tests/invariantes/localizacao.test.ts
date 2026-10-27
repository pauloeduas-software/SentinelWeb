import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../server/core/database/prismaClient';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import {
  criarAtivo, criarFabricante, criarItemDeEstoque, criarLocal, criarModelo, criarPosto, idsDoSeed,
} from '../helpers/fixtures';

// A LOCALIZAÇÃO: o que segura o delete, e o que a desativação fecha.
//
// Localização é cadastro de REFERÊNCIA, com a regra do status (decisão Y): diz
// onde a coisa está GUARDADA e não recebe nada — quem recebe entrega, estoque e
// ocupante é o posto. Só o que aponta para ela AGORA segura o delete: ativo ou
// estoque guardado, posto que fica nela. Desativada, ela some das escolhas e
// não guarda nada novo — mas o que já aponta para ela continua editável.

let api: ApiDeTeste;
let seed: Awaited<ReturnType<typeof idsDoSeed>>;
let modelId = '';

beforeAll(async () => {
  api = await criarApi();
  seed = await idsDoSeed();
  const fabricanteId = await criarFabricante(api, 'Fabricante das Localizações');
  modelId = await criarModelo(api, { categoriaId: seed.categoriaId, fabricanteId });
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

describe('excluir localização — a regra do status', () => {
  it('recusa a que guarda um ativo, e a dica diz o que fazer', async () => {
    const deposito = await criarLocal(api, { name: 'Depósito com projetor' });
    await ativoDisponivel('Projetor guardado', deposito);

    const { status, body } = await api.delete<{ error: string }>(`/api/locations/${deposito}`);
    expect(status).toBe(409);
    expect(body.error).toMatch(/1 registro/);
    // A recusa ensina a saída — sem a dica, o operador fica sem caminho.
    expect(body.error).toContain('Mova o que está guardado nela');
  });

  it('recusa a que tem um POSTO nela', async () => {
    const filial = await criarLocal(api, { name: 'Filial com mesa' });
    await criarPosto(api, { name: 'Mesa da filial', locationId: filial });

    const { status } = await api.delete(`/api/locations/${filial}`);
    expect(status).toBe(409);
    expect(await prisma.location.count({ where: { id: filial } })).toBe(1);
  });

  it('apaga a que está vazia de verdade', async () => {
    const vazia = await criarLocal(api, { name: 'Sala nunca usada' });
    expect((await api.delete(`/api/locations/${vazia}`)).status).toBe(200);
    expect(await prisma.location.count({ where: { id: vazia } })).toBe(0);
  });
});

describe('localização não recebe — quem recebe é o posto', () => {
  it('a entrega de ativo a uma localização é 422: o alvo não existe mais', async () => {
    const sala = await criarLocal(api, { name: 'Sala sem entrega' });
    const ativo = await ativoDisponivel('Notebook sem destino');

    const { status } = await api.post(`/api/assets/${ativo.id}/checkout`, {
      targetType: 'LOCATION', targetLocationId: sala,
    });
    expect(status).toBe(422);
    expect(await prisma.assignment.count({ where: { assetId: ativo.id } })).toBe(0);
  });

  it('a saída de estoque para uma localização também é 422', async () => {
    const sala = await criarLocal(api, { name: 'Sala sem estoque' });
    const mouse = await criarItemDeEstoque(api, { name: 'Mouse sem destino', categoryId: seed.categoriaEstoqueId, qty: 1 });

    const { status } = await api.post(`/api/stock/items/${mouse.id}/checkout`, {
      targetType: 'LOCATION', targetLocationId: sala,
    });
    expect(status).toBe(422);
  });
});

describe('localização desativada não guarda nada NOVO', () => {
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

  it('recusa ativo NOVO cadastrado nela', async () => {
    const deposito = await criarLocal(api, { name: 'Depósito fechado' });
    await desativar(deposito);

    const { status, body } = await api.post<{ error: string }>('/api/assets', {
      statusId: seed.statusDeployableId, modelId, locationId: deposito,
    });
    expect(status).toBe(409);
    expect(body.error).toMatch(/desativada/);
  });

  it('recusa posto NOVO nela', async () => {
    const filial = await criarLocal(api, { name: 'Filial fechada' });
    await desativar(filial);

    const { status, body } = await api.post<{ error: string }>('/api/workstations', {
      name: 'Mesa da filial fechada', locationId: filial,
    });
    expect(status).toBe(409);
    expect(body.error).toMatch(/"Filial fechada" está desativada e não recebe posto novo/);
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

  it('deixa editar o posto que JÁ está nela, sem mudar o local', async () => {
    const filial = await criarLocal(api, { name: 'Filial antiga' });
    const mesa = await criarPosto(api, { name: 'Mesa da filial antiga', locationId: filial });
    await desativar(filial);

    const { status } = await api.put(`/api/workstations/${mesa}`, { name: 'Mesa renomeada', locationId: filial });
    expect(status).toBe(200);
  });
});

describe('a localização é uma lista plana', () => {
  it('recusa "Dentro de", "Gestor" e a antiga marca de posto no corpo', async () => {
    // `strictObject` na borda: campo desconhecido é 422, e não ignorado em
    // silêncio. Um cliente antigo que ainda mande o pai fica sabendo.
    const pai = await api.post('/api/locations', { name: 'Com pai', parentId: '00000000-0000-4000-8000-000000000000' });
    expect(pai.status).toBe(422);

    const gestor = await api.post('/api/locations', { name: 'Com gestor', managerId: '00000000-0000-4000-8000-000000000000' });
    expect(gestor.status).toBe(422);

    const marca = await api.post('/api/locations', { name: 'Com marca', isWorkstation: true });
    expect(marca.status).toBe(422);
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

    // Guardado é presente: o item aponta para cá agora, como um ativo aponta
    // para o status que tem.
    const exclusao = await api.delete<{ error: string }>(`/api/locations/${deposito}`);
    expect(exclusao.status).toBe(409);
    expect(exclusao.body.error).toMatch(/Mova o que está guardado nela/);
  });

  it('localização desativada não recebe estoque novo — mas o item que já estava lá continua editável', async () => {
    const deposito = await criarLocal(api, { name: 'Depósito antigo de estoque' });
    const item = await api.post<{ id: string }>(
      '/api/stock/items', { name: 'Teclado guardado', categoryId: seed.categoriaEstoqueId, qty: 1, locationId: deposito },
    );
    await desativar(deposito);

    const novo = await api.post('/api/stock/items', { name: 'Cabo novo', categoryId: seed.categoriaEstoqueId, qty: 1, locationId: deposito });
    expect(novo.status).toBe(409);

    const edicao = await api.put(`/api/stock/items/${item.body.id}`, {
      name: 'Teclado guardado renomeado', categoryId: seed.categoriaEstoqueId, locationId: deposito,
    });
    expect(edicao.status).toBe(200);
  });
});
