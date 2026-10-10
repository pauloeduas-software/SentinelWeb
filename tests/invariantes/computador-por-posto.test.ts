import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../server/core/database/prismaClient';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import { conectarAgente, esperarPor } from '../helpers/agente';
import { criarAtivo, criarFabricante, criarModelo, idsDoSeed } from '../helpers/fixtures';

// INVARIANTE 19 — no máximo UM computador por posto de trabalho.
//
// Computador = ativo com MÁQUINA VINCULADA. A regra vale só onde
// `isWorkstation` é verdade, e não limita monitor, teclado nem periférico.
//
// São DUAS portas, e a segunda não é redundante: sem ela a regra seria
// contornável pela ordem — entregar ao posto o desktop SEM agente, que passa
// porque ainda não é computador, e vincular a máquina depois.
//
// AS TROCAS (devolver, desvincular, re-vincular, lixeira) estão no arquivo
// irmão `computador-por-posto-trocas.test.ts`, e não aqui, pelo teto de
// escrita: 40 por minuto por INSTÂNCIA, e a instância é por arquivo.

const PREFIXO = 'A';

let api: ApiDeTeste;
let seed: Awaited<ReturnType<typeof idsDoSeed>>;
let modelId: string;
let contador = 0;

beforeAll(async () => {
  api = await criarApi();
  seed = await idsDoSeed();
  const fabricanteId = await criarFabricante(api, 'Fabricante do Posto');
  modelId = await criarModelo(api, { categoriaId: seed.categoriaId, fabricanteId });
});

afterAll(async () => {
  await api.fechar();
});

/**
 * O posto, pelo PRISMA e não pela API.
 *
 * O teto de escrita é 40 por minuto e é contado em memória por instância da
 * aplicação (`tests/helpers/app.ts`), e uma instância é por ARQUIVO. Cada caso
 * aqui gasta escrita em ativo, vínculo e entrega — que são o que está sob teste
 * — e o cadastro do posto não é. É a mesma escolha do teste das 205
 * localizações: `createMany` em vez de 205 `POST`, porque o que se exercita é
 * outra coisa.
 */
async function criarPosto(name: string, isWorkstation = true) {
  const criado = await prisma.location.create({ data: { name, isWorkstation }, select: { id: true } });
  return criado.id;
}

/** Um ativo disponível, sem máquina. */
async function ativo(nome: string) {
  contador += 1;
  return criarAtivo(api, {
    statusId: seed.statusDeployableId,
    modelId,
    name: nome,
    assetTag: `POSTO-${PREFIXO}-${String(contador).padStart(3, '0')}`,
  });
}

/**
 * Vincula uma máquina ao ativo — é o que o transforma EM computador.
 *
 * Pelo caminho humano (`POST /api/endpoints/:id/link`) e com agente de verdade,
 * porque é o handshake que cria a linha de `endpoints`: gravar pelo Prisma
 * pularia o use-case que esta invariante guarda.
 */
async function darMaquinaA(assetId: string, hwid: string) {
  const agente = await conectarAgente(api, hwid);
  await agente.handshake({ Hostname: `pc-${hwid}` });
  const maquina = await esperarPor(`a máquina ${hwid}`, () =>
    prisma.endpoint.findUnique({ where: { hwid } }));
  await agente.fechar();

  const { status, body } = await api.post(`/api/endpoints/${maquina.id}/link`, { assetId });
  return { endpointId: maquina.id, status, body };
}

/**
 * O mesmo, exigindo que o vínculo tenha acontecido.
 *
 * Existe porque sem a asserção um 429 do teto de escrita deixa o ativo SEM
 * máquina em silêncio, e o caso seguinte falha dizendo "esperava 409, recebeu
 * 201" — uma falha que não fala do que o teste investiga.
 */
async function darMaquinaOuFalhar(assetId: string, hwid: string) {
  const r = await darMaquinaA(assetId, hwid);
  expect(r.status, `vínculo de ${hwid} falhou: ${JSON.stringify(r.body)}`).toBe(201);
  return r;
}

async function entregarAoPosto(assetId: string, locationId: string) {
  return api.post<{ error: string; assetId?: string }>(`/api/assets/${assetId}/checkout`, {
    targetType: 'LOCATION',
    targetLocationId: locationId,
  });
}

describe('invariante 19 — no máximo um computador por posto', () => {
  it('a porta do CHECKOUT recusa o segundo computador, dizendo qual já está lá', async () => {
    const posto = await criarPosto('Mesa Um Computador');

    const primeiro = await ativo('Desktop da Mesa');
    await darMaquinaOuFalhar(primeiro.id, 'posto-primeiro');
    expect((await entregarAoPosto(primeiro.id, posto)).status).toBe(201);

    const segundo = await ativo('Outro Desktop');
    await darMaquinaOuFalhar(segundo.id, 'posto-segundo');
    const { status, body } = await entregarAoPosto(segundo.id, posto);

    expect(status).toBe(409);
    // A mensagem NOMEIA o computador que já está no posto: sem isso, quem está
    // na tela não sabe o que devolver.
    expect(body.error).toContain(primeiro.assetTag);
    expect(body.error).toMatch(/j[áa] tem um computador/i);
    expect(body.assetId).toBe(primeiro.id);
  });

  it('a porta do VÍNCULO recusa: entregar sem agente e vincular depois não contorna', async () => {
    const posto = await criarPosto('Mesa do Contorno');

    const comMaquina = await ativo('Desktop com agente');
    await darMaquinaOuFalhar(comMaquina.id, 'contorno-com');
    expect((await entregarAoPosto(comMaquina.id, posto)).status).toBe(201);

    // Este ainda NÃO é computador, então o checkout o aceita no mesmo posto.
    const semMaquina = await ativo('Desktop sem agente');
    expect((await entregarAoPosto(semMaquina.id, posto)).status).toBe(201);

    // É o vínculo que o transformaria em computador — e é ele que recusa.
    const { status, body } = await darMaquinaA(semMaquina.id, 'contorno-sem');

    expect(status).toBe(409);
    expect((body as { error: string }).error).toContain(comMaquina.assetTag);

    // E nada foi gravado: o ativo continua sem máquina.
    const depois = await prisma.endpoint.findUnique({ where: { hwid: 'contorno-sem' } });
    expect(depois?.assetId).toBeNull();
  });

  it('monitor sem máquina entra num posto que já tem computador', async () => {
    const posto = await criarPosto('Mesa com Monitor');

    const computador = await ativo('Desktop da mesa com monitor');
    await darMaquinaOuFalhar(computador.id, 'monitor-computador');
    expect((await entregarAoPosto(computador.id, posto)).status).toBe(201);

    // O modelo de posse descreve a mesa com VÁRIOS ativos — a regra é sobre
    // computador, não sobre ativo.
    const monitor = await ativo('Monitor 24"');
    expect((await entregarAoPosto(monitor.id, posto)).status).toBe(201);

    const teclado = await ativo('Teclado');
    expect((await entregarAoPosto(teclado.id, posto)).status).toBe(201);

    const quantos = await prisma.assignment.count({
      where: { targetLocationId: posto, checkinAt: null },
    });
    expect(quantos).toBe(3);
  });

  it('dois computadores na SALA DE REUNIÃO passam: a regra é só do posto marcado', async () => {
    const sala = await criarPosto('Sala de Reunião', false);

    const um = await ativo('Desktop da sala 1');
    await darMaquinaOuFalhar(um.id, 'sala-um');
    expect((await entregarAoPosto(um.id, sala)).status).toBe(201);

    const dois = await ativo('Desktop da sala 2');
    await darMaquinaOuFalhar(dois.id, 'sala-dois');
    expect((await entregarAoPosto(dois.id, sala)).status).toBe(201);

    // E o vínculo também não reclama, pelo mesmo motivo.
    const tres = await ativo('Desktop da sala 3');
    expect((await entregarAoPosto(tres.id, sala)).status).toBe(201);
    expect((await darMaquinaA(tres.id, 'sala-tres')).status).toBe(201);
  });

});
