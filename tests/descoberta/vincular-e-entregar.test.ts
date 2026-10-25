import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../server/core/database/prismaClient';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import { conectarAgente, esperarPor } from '../helpers/agente';
import { criarAtivo, criarFabricante, criarModelo, idsDoSeed } from '../helpers/fixtures';

// VINCULAR E ENTREGAR AO POSTO NUMA OPERAÇÃO — `POST /api/endpoints/:id/link-and-checkout`.
//
// É o cadastro de um computador novo contado de ponta a ponta, a partir de
// `/descobertas`: a máquina apareceu, o ativo existe, a mesa dele é a Mesa 1.
// Duas operações do sistema encadeadas em SEQUÊNCIA, sem transação em volta
// (o Prisma não aninha), e a ordem é o que este arquivo fixa: vincular primeiro.
//
// E o seletor que a tela usa para escolher o ativo: `/api/assets/options`
// com `?maquina=sem`, que deixa de fora quem já tem máquina — a opção que o
// `endpoints.assetId @unique` recusaria no clique.

let api: ApiDeTeste;
let seed: Awaited<ReturnType<typeof idsDoSeed>>;
let modelId: string;
let contador = 0;

beforeAll(async () => {
  api = await criarApi();
  seed = await idsDoSeed();
  const fabricanteId = await criarFabricante(api, 'Fabricante do Vínculo com Entrega');
  modelId = await criarModelo(api, { categoriaId: seed.categoriaId, fabricanteId });
});

afterAll(async () => {
  await api.fechar();
});

async function ativo(nome: string, statusId = seed.statusDeployableId) {
  contador += 1;
  return criarAtivo(api, { statusId, modelId, name: nome, assetTag: `VE-${String(contador).padStart(3, '0')}` });
}

async function posto(nome: string) {
  const criado = await prisma.workstation.create({
    data: { name: nome, location: { create: { name: `Local de ${nome}` } } },
    select: { id: true },
  });
  return criado.id;
}

/** Uma máquina real, pelo handshake, já desconectada. */
async function maquina(hwid: string): Promise<string> {
  const agente = await conectarAgente(api, hwid);
  await agente.handshake({ Hostname: `pc-${hwid}` });
  const endpoint = await esperarPor(hwid, () => prisma.endpoint.findUnique({ where: { hwid } }));
  await agente.fechar();
  return endpoint.id;
}

const vincularEEntregar = (endpointId: string, assetId: string, targetWorkstationId: string) =>
  api.post<{ error: string; endpoint: { assetId: string }; assignment: { targetWorkstationId: string } }>(
    `/api/endpoints/${endpointId}/link-and-checkout`,
    { assetId, targetWorkstationId },
  );

describe('POST /api/endpoints/:id/link-and-checkout', () => {
  it('vincula a máquina ao ativo e entrega o ativo ao posto, com 201', async () => {
    const mesa = await posto('Mesa do vínculo com entrega');
    const desktop = await ativo('Desktop novo');
    const endpointId = await maquina('ve-feliz');

    const { status, body } = await vincularEEntregar(endpointId, desktop.id, mesa);

    expect(status).toBe(201);
    expect(body.endpoint.assetId).toBe(desktop.id);
    expect(body.assignment.targetWorkstationId).toBe(mesa);

    // As duas linhas no banco, e o histórico do ativo com os dois eventos.
    expect((await prisma.endpoint.findUniqueOrThrow({ where: { id: endpointId } })).assetId).toBe(desktop.id);
    expect(await prisma.assignment.count({ where: { assetId: desktop.id, checkinAt: null, targetWorkstationId: mesa } })).toBe(1);
    const acoes = await prisma.auditLog.findMany({
      where: { entityType: 'Asset', entityId: desktop.id, action: { in: ['LINK', 'CHECKOUT'] } },
      select: { action: true, actorId: true, requestId: true },
    });
    expect(acoes.map((a) => a.action)).toEqual(expect.arrayContaining(['LINK', 'CHECKOUT']));
    // Uma requisição, duas linhas: a mesma conta e o mesmo `requestId` nas duas (AB).
    expect(acoes.every((a) => a.actorId === api.adminId)).toBe(true);
    expect(new Set(acoes.map((a) => a.requestId)).size).toBe(1);
  });

  it('quando a entrega falha, o vínculo FICA e a resposta diz isso', async () => {
    // Ativo que não está disponível: a entrega recusa com 409. É a ordem
    // errando para o lado certo — a máquina É aquele patrimônio, e isso ficou
    // gravado; o que não aconteceu foi a posse, que é estado normal de um ativo
    // com agente.
    const mesa = await posto('Mesa da entrega que falha');
    const emUso = await ativo('Desktop já em uso', seed.statusEmUsoId);
    const endpointId = await maquina('ve-entrega-falha');

    const { status, body } = await vincularEEntregar(endpointId, emUso.id, mesa);

    expect(status).toBe(409);
    expect(body.error).toMatch(/vinculada ao ativo, mas a entrega/i);
    expect(body.error).toMatch(/dispon[íi]vel/i);

    expect((await prisma.endpoint.findUniqueOrThrow({ where: { id: endpointId } })).assetId).toBe(emUso.id);
    expect(await prisma.assignment.count({ where: { assetId: emUso.id, checkinAt: null } })).toBe(0);
  });

  it('e o posto que já tem ativo recusa a entrega pela porta da invariante 19', async () => {
    const mesa = await posto('Mesa já com ativo');
    const primeiro = await ativo('Primeiro computador');
    expect((await vincularEEntregar(await maquina('ve-primeiro'), primeiro.id, mesa)).status).toBe(201);

    const segundo = await ativo('Segundo computador');
    const { status, body } = await vincularEEntregar(await maquina('ve-segundo'), segundo.id, mesa);

    expect(status).toBe(409);
    expect(body.error).toContain(primeiro.assetTag);
    expect(body.error).toMatch(/j[áa] tem um ativo/i);
    // O vínculo do segundo ficou: a máquina é dele. O que não entrou foi na mesa.
    expect(await prisma.assignment.count({ where: { assetId: segundo.id, checkinAt: null } })).toBe(0);
  });

  it('desvincular a máquina NÃO libera a vaga: o ativo continua sendo o da mesa', async () => {
    // Era o atalho da regra antiga — "computador = ativo com máquina": tirar a
    // máquina do ativo velho o transformava em "não computador" e o novo
    // entrava por cima. Com a regra sobre o ativo, trocar o computador da mesa é
    // devolver o antigo e entregar o novo.
    const mesa = await posto('Mesa da troca de máquina');
    const velho = await ativo('Desktop velho');
    const endpointId = await maquina('ve-troca-velho');
    expect((await vincularEEntregar(endpointId, velho.id, mesa)).status).toBe(201);

    expect((await api.delete(`/api/endpoints/${endpointId}/link`)).status).toBe(200);

    const novo = await ativo('Desktop novo');
    const { status, body } = await vincularEEntregar(await maquina('ve-troca-novo'), novo.id, mesa);
    expect(status).toBe(409);
    expect(body.error).toContain(velho.assetTag);
  });

  it('corpo sem o posto é 422, e máquina que não existe é 404', async () => {
    const desktop = await ativo('Desktop do corpo incompleto');
    const endpointId = await maquina('ve-corpo');

    const semPosto = await api.post(`/api/endpoints/${endpointId}/link-and-checkout`, { assetId: desktop.id });
    expect(semPosto.status).toBe(422);

    const mesa = await posto('Mesa da máquina inexistente');
    const { status } = await vincularEEntregar('00000000-0000-0000-0000-000000000000', desktop.id, mesa);
    expect(status).toBe(404);

    // E nada ficou do 422: o ativo continua sem máquina.
    expect(await prisma.endpoint.count({ where: { assetId: desktop.id } })).toBe(0);
  });
});

describe('GET /api/assets/options?maquina=sem', () => {
  it('deixa de fora o ativo que já tem máquina, e o valor errado é 422', async () => {
    const comMaquina = await ativo('Ativo com máquina');
    const semMaquina = await ativo('Ativo sem máquina');
    expect((await api.post(`/api/endpoints/${await maquina('ve-opcoes')}/link`, { assetId: comMaquina.id })).status).toBe(201);

    const { status, body } = await api.get<{ id: string }[]>('/api/assets/options?maquina=sem');
    expect(status).toBe(200);
    const ids = body.map((opcao) => opcao.id);
    expect(ids).toContain(semMaquina.id);
    expect(ids).not.toContain(comMaquina.id);

    // Sem o filtro os dois vêm: é o seletor da entrega, que não se importa.
    const todos = await api.get<{ id: string }[]>('/api/assets/options');
    expect(todos.body.map((opcao) => opcao.id)).toEqual(expect.arrayContaining([comMaquina.id, semMaquina.id]));

    expect((await api.get('/api/assets/options?maquina=com')).status).toBe(422);
  });
});
