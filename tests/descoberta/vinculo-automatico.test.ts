import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import { conectarAgente, esperarPor } from '../helpers/agente';
import { criarAtivo, criarFabricante, criarModelo, idsDoSeed, motivoDaBaixa } from '../helpers/fixtures';
import { vincularPelaSerie } from '../../server/modules/reconciliation/use-cases/auto-link-endpoint.usecase';
import { prisma } from '../../server/infra/database/prismaClient';
import type { Endpoint, EndpointComTelemetria } from '../../src/types/endpoint.types';

// O VÍNCULO AUTOMÁTICO PELA SÉRIE (DC) — a regra 14 do GLPI contra o computador.
//
// A série que a máquina manda, igual à de UM computador vivo sem máquina, liga as
// duas no handshake, e o computador salvo depois procura a máquina que chegou
// antes. Todo o resto não liga: a série de fábrica, a repetida no parque, a do
// computador baixado ou já ocupado, o nome, e a máquina que alguém desvinculou.
// O vínculo errado é o pior resultado possível, porque ninguém o revisa.

let api: ApiDeTeste;
let modelId: string;
let statusId: string;

beforeAll(async () => {
  api = await criarApi();
  const seed = await idsDoSeed();
  statusId = seed.statusDeployableId;
  modelId = await criarModelo(api, {
    categoriaId: seed.categoriaId,
    fabricanteId: await criarFabricante(api),
  });
});

afterAll(async () => {
  await api.fechar();
});

/** O computador com série digitada — o lado CADASTRADO do vínculo. */
async function computador(serial: string, nome: string) {
  return criarAtivo(api, { statusId, modelId, name: nome, serial });
}

/** A máquina que mandou um handshake, já gravada. */
async function maquina(hwid: string, payload: Record<string, unknown>) {
  const agente = await conectarAgente(api, hwid);
  await agente.handshake(payload);
  const gravada = await esperarPor(`a máquina ${hwid}`, () => prisma.endpoint.findUnique({ where: { hwid } }));
  await agente.fechar();
  return gravada;
}

/**
 * A regra de novo, esperada: o handshake a roda sem avisar quando terminou, e a
 * prova de que NÃO ligou precisa da tentativa inteira.
 */
async function naoLiga(endpointId: string) {
  expect(await vincularPelaSerie(endpointId)).toBe(false);
  const depois = await prisma.endpoint.findUniqueOrThrow({ where: { id: endpointId } });
  expect(depois.assetId).toBeNull();
}

async function linhaDaLista(endpointId: string): Promise<Endpoint> {
  const { body } = await api.get<{ rows: Endpoint[] }>('/api/endpoints?vista=sem');
  const linha = body.rows.find((row) => row.id === endpointId);
  if (!linha) throw new Error(`a máquina ${endpointId} não está em Sem computador`);
  return linha;
}

describe('a série igual à de um único computador', () => {
  it('liga no handshake, assinado pelo sistema', async () => {
    const ativo = await computador('SN-AUTOMATICO-7', 'Desktop vinculado sozinho');
    const nova = await maquina('automatico-1', { BiosSerial: 'SN-AUTOMATICO-7', Hostname: 'pc-automatico' });

    await esperarPor('o vínculo automático', () => prisma.endpoint.findFirst({ where: { id: nova.id, assetId: ativo.id } }));

    // Ninguém clicou: quem decidiu foi a regra. É a diferença entre "o sistema
    // fez" e "a conta X fez" que a auditoria existe para mostrar (AB).
    const log = await prisma.auditLog.findFirstOrThrow({
      where: { entityType: 'Asset', entityId: ativo.id, action: 'LINK' },
    });
    expect(log).toMatchObject({
      actorType: 'SYSTEM', actorId: null, actorName: null, actorEmail: null, requestId: null,
      source: 'vinculo-automatico', entityLabel: ativo.assetTag,
    });
    expect(log.changes).toMatchObject({ origem: { para: 'automatico' }, sinal: { para: 'SERIAL' } });
  });

  it('liga quando o computador é cadastrado DEPOIS da máquina', async () => {
    const antes = await maquina('chegou-antes', { BiosSerial: 'SN-CHEGOU-ANTES', Hostname: 'pc-chegou-antes' });
    await naoLiga(antes.id);

    // A resposta do cadastro só volta depois da procura: nada a esperar.
    const ativo = await computador('SN-CHEGOU-ANTES', 'Cadastrado depois');
    const depois = await prisma.endpoint.findUniqueOrThrow({ where: { id: antes.id } });
    expect(depois.assetId).toBe(ativo.id);
  });

  it('liga quando a série entra no computador pela edição', async () => {
    const semSerie = await criarAtivo(api, { statusId, modelId, name: 'Sem série ainda' });
    const nova = await maquina('serie-na-edicao', { BiosSerial: 'SN-NA-EDICAO', Hostname: 'pc-edicao' });
    await naoLiga(nova.id);

    const { status } = await api.put(`/api/assets/${semSerie.id}`, { serial: 'SN-NA-EDICAO' });
    expect(status).toBe(200);
    expect((await prisma.endpoint.findUniqueOrThrow({ where: { id: nova.id } })).assetId).toBe(semSerie.id);
  });
});

describe('a série que não prova nada não liga', () => {
  it('a de fábrica', async () => {
    await computador('To Be Filled By O.E.M.', 'Placa genérica');
    const nova = await maquina('fabrica-1', { BiosSerial: 'To Be Filled By O.E.M.', Hostname: 'pc-fabrica-1' });
    await naoLiga(nova.id);
  });

  it('a repetida em duas máquinas, mesmo fora da lista de fábrica, e a linha diz por quê', async () => {
    await computador('ABC123456', 'Notebook de serial repetido');
    // UUIDs diferentes: com o mesmo serial e sem UUID, a segunda seria a primeira
    // reinstalada, e herdaria a linha dela (CV).
    const a = await maquina('repetido-a', {
      BiosSerial: 'ABC123456', SystemUuid: '4c4c4544-0000-1000-8000-00000000000a', Hostname: 'pc-repetido-a',
    });
    // A primeira liga sozinha antes de a segunda chegar: o parque só desmente o serial
    // quando vê a repetição. Espera o vínculo do handshake terminar, que roda depois de a
    // máquina ser gravada, e desliga, para medir a regra com as duas à vista. Desligado
    // antes, o vínculo em curso religava e o teste reprovava de vez em quando.
    await esperarPor('o vínculo da primeira', () => prisma.endpoint.findFirst({ where: { id: a.id, assetId: { not: null } } }));
    await prisma.endpoint.update({ where: { id: a.id }, data: { assetId: null } });
    const b = await maquina('repetido-b', {
      BiosSerial: 'ABC123456', SystemUuid: '4c4c4544-0000-1000-8000-00000000000b', Hostname: 'pc-repetido-b',
    });

    await naoLiga(a.id);
    await naoLiga(b.id);
    expect((await linhaDaLista(b.id)).aviso).toBe('A série se repete em outra máquina.');
  });

  it('a de um computador baixado', async () => {
    const ativo = await computador('SN-BAIXADO-9', 'Vendido');
    const baixa = await api.post(`/api/assets/${ativo.id}/retire`, { retiredReasonId: await motivoDaBaixa() });
    expect(baixa.status).toBe(200);

    const nova = await maquina('baixado-1', { BiosSerial: 'SN-BAIXADO-9', Hostname: 'pc-baixado' });
    await naoLiga(nova.id);
    expect((await linhaDaLista(nova.id)).aviso).toBe(`A série é a de ${ativo.assetTag}, que teve baixa.`);
  });

  it('a de um computador que já tem máquina: a placa-mãe trocada com a reinstalação', async () => {
    const ativo = await computador('SN-PLACA-NOVA', 'Placa trocada');
    const velha = await maquina('placa-velha', { Hostname: 'pc-placa-velha' });
    await api.post(`/api/endpoints/${velha.id}/link`, { assetId: ativo.id });

    const nova = await maquina('placa-nova', { BiosSerial: 'SN-PLACA-NOVA', Hostname: 'pc-placa-nova' });
    await naoLiga(nova.id);
    expect((await linhaDaLista(nova.id)).aviso)
      .toBe(`A série é a de ${ativo.assetTag}, que já tem a máquina pc-placa-velha.`);
  });
});

describe('o nome nunca liga', () => {
  it('só vira a dica do Vincular', async () => {
    const ativo = await computador('SN-DO-NOME-1', 'pc-pelo-nome');
    const nova = await maquina('pelo-nome', { Hostname: 'pc-pelo-nome.empresa.local' });

    await naoLiga(nova.id);
    expect((await linhaDaLista(nova.id)).dica).toEqual({ id: ativo.id, assetTag: ativo.assetTag, sinal: 'NOME' });
  });

  it('e o nome de dois computadores não dá dica: é colisão (D46)', async () => {
    // Um pelo `name`, o outro pela etiqueta: a mesma pergunta, "que computador se chama assim?".
    await criarAtivo(api, { statusId, modelId, name: 'pc-ambiguo' });
    await criarAtivo(api, { statusId, modelId, assetTag: 'PC-AMBIGUO' });
    const nova = await maquina('ambiguo-1', { Hostname: 'pc-ambiguo' });

    const linha = await linhaDaLista(nova.id);
    expect(linha.dica).toBeNull();
    expect(linha.aviso).toBeNull();
  });
});

describe('a máquina desvinculada', () => {
  it('não volta sozinha, até alguém vinculá-la à mão', async () => {
    const ativo = await computador('SN-DESVINCULADA', 'Vínculo corrigido');
    const nova = await maquina('desvinculada-1', { BiosSerial: 'SN-DESVINCULADA', Hostname: 'pc-desvinculada' });
    await esperarPor('o vínculo automático', () => prisma.endpoint.findFirst({ where: { id: nova.id, assetId: ativo.id } }));

    expect((await api.delete(`/api/endpoints/${nova.id}/link`)).status).toBe(200);

    // O handshake seguinte, com a mesma série, não a religa.
    await maquina('desvinculada-1', { BiosSerial: 'SN-DESVINCULADA', Hostname: 'pc-desvinculada' });
    await naoLiga(nova.id);
    expect((await linhaDaLista(nova.id)).dica).toEqual({ id: ativo.id, assetTag: ativo.assetTag, sinal: 'SERIE' });

    // O vínculo à mão decide qual computador ela é, e religa o automático.
    expect((await api.post(`/api/endpoints/${nova.id}/link`, { assetId: ativo.id })).status).toBe(201);
    const religada = await prisma.endpoint.findUniqueOrThrow({ where: { id: nova.id } });
    expect(religada).toMatchObject({ assetId: ativo.id, autoLinkOff: false });
  });
});

describe('o vínculo à mão', () => {
  it('recusa o computador que já tem máquina, com uma instrução que existe', async () => {
    const ativo = await computador('SN-OCUPADO-2', 'Ativo de vínculo duplo');
    const primeira = await maquina('duplo-primeira', { Hostname: 'pc-duplo-1' });
    await api.post(`/api/endpoints/${primeira.id}/link`, { assetId: ativo.id });
    const segunda = await maquina('duplo-segunda', { Hostname: 'pc-duplo-2' });

    const { status, body } = await api.post<{ error: string }>(`/api/endpoints/${segunda.id}/link`, { assetId: ativo.id });

    // 409 do `endpoints.assetId @unique`, traduzido, apontando o Desvincular de Agentes.
    expect(status).toBe(409);
    expect(body.error).toBe('Este computador já está vinculado a outra máquina. Desvincule a outra máquina antes, em Agentes.');
  });
});

describe('a ficha da máquina (DF)', () => {
  it('traz a dica e o aviso da linha da lista, e o computador quando há vínculo', async () => {
    const ativo = await computador('SN-DA-FICHA-1', 'pc-da-ficha');
    const nova = await maquina('da-ficha', { Hostname: 'pc-da-ficha' });

    const semComputador = await api.get<EndpointComTelemetria>(`/api/endpoints/${nova.id}`);
    expect(semComputador.body).toMatchObject({
      asset: null, dica: { id: ativo.id, assetTag: ativo.assetTag, sinal: 'NOME' }, aviso: null,
    });
    expect(semComputador.body).not.toHaveProperty('autoLinkOff');

    await api.post(`/api/endpoints/${nova.id}/link`, { assetId: ativo.id });
    const { body } = await api.get<EndpointComTelemetria>(`/api/endpoints/${nova.id}`);
    expect(body.dica).toBeNull();
    expect(body.asset).toMatchObject({
      id: ativo.id, assetTag: ativo.assetTag, serial: 'SN-DA-FICHA-1',
      model: { name: expect.any(String), category: { name: expect.any(String) } },
      status: { type: 'DEPLOYABLE' },
    });
  });
});
