import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../server/infra/database/prismaClient';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import {
  criarAtivo, criarFabricante, criarItemDeEstoque, criarLocal, criarModelo, criarPosto, idsDoSeed,
} from '../helpers/fixtures';

// A LOCALIZAÇÃO: o que segura o delete.
//
// Localização é cadastro de REFERÊNCIA, com a regra do status (decisão Y): diz
// onde a coisa está GUARDADA e não recebe nada — quem recebe entrega, estoque e
// ocupante é o posto. Só o que aponta para ela AGORA segura o delete: ativo ou
// estoque guardado, posto que fica nela. Ela não se desativa (AO): a vazia se
// exclui.

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

describe('excluir localização — a regra do status', () => {
  it('recusa a que guarda um ativo, e a dica diz o que fazer', async () => {
    const deposito = await criarLocal(api, { name: 'Depósito com projetor' });
    await ativoDisponivel('Projetor guardado', deposito);

    const { status, body } = await api.delete<{ error: string }>(`/api/locations/${deposito}`);
    expect(status).toBe(409);
    expect(body.error).toMatch(/1 registro/);
    // A recusa ensina a saída — sem a dica, o operador fica sem caminho.
    expect(body.error).toContain('Mova o que está guardado nela e os postos que ficam nela, e exclua de novo.');
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

  it('a entrega de estoque para uma localização também é 422', async () => {
    const sala = await criarLocal(api, { name: 'Sala sem estoque' });
    const mouse = await criarItemDeEstoque(api, { name: 'Mouse sem destino', categoryId: seed.categoriaEstoqueId, qty: 1 });

    const { status } = await api.post(`/api/stock/items/${mouse.id}/checkout`, {
      targetType: 'LOCATION', targetLocationId: sala,
    });
    expect(status).toBe(422);
  });
});

describe('sem Desativar (AO)', () => {
  it('mandar isActive é 422, e o /options oferece todas', async () => {
    const sala = await criarLocal(api, { name: 'Opção sem desativar' });
    expect((await api.put(`/api/locations/${sala}`, { isActive: false })).status).toBe(422);

    const { body } = await api.get<{ id: string }[]>('/api/locations/options?q=Op%C3%A7%C3%A3o');
    expect(body.map((o) => o.id)).toContain(sala);
  });

  it('a que não existe é 404 no ativo, no item e no posto', async () => {
    const inexistente = '00000000-0000-4000-8000-000000000000';
    const ativo = await api.post('/api/assets', { statusId: seed.statusDeployableId, modelId, locationId: inexistente });
    expect(ativo.status).toBe(404);
    const item = await api.post('/api/stock/items', {
      name: 'Item sem lugar', categoryId: seed.categoriaEstoqueId, qty: 1, locationId: inexistente,
    });
    expect(item.status).toBe(404);
    const posto = await api.post('/api/workstations', { name: 'Mesa sem lugar', locationId: inexistente });
    expect(posto.status).toBe(404);
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
});
