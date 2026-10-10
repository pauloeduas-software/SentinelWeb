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
// São DUAS portas que RECUSAM, e a segunda não é redundante: sem ela a regra
// seria contornável pela ordem — entregar ao posto o desktop SEM agente, que
// passa porque ainda não é computador, e vincular a máquina depois. Elas estão
// no primeiro `describe`.
//
// O segundo `describe` cobre o outro lado: a regra é "no máximo um", não
// "exatamente um", e os quatro caminhos que LIBERAM a vaga precisam funcionar,
// ou a regra tranca o posto em vez de protegê-lo.
//
// OS DOIS ESTAVAM EM ARQUIVOS SEPARADOS, e o motivo não era o assunto: era o
// teto de escrita, contado por instância da aplicação, e o vínculo de máquina é
// rota destrutiva — teto de DEZ. Uma metade gastava oito vínculos e a outra sete;
// juntas são quinze, e dezessete contando o re-vínculo e o desvínculo. O teto
// saiu do ambiente de teste
// (`server/app.ts`, `comTetoDeRequisicao`; a prova dele vive em
// `teto-de-requisicao.test.ts`) e as duas metades voltaram para onde a
// invariante está escrita: um arquivo.
//
// A TERCEIRA PORTA — marcar como posto um local que já tem dois computadores —
// fica em `computador-por-posto-marca.test.ts`. Aquela separação é por ASSUNTO:
// ela não guarda a entrada do computador no posto, guarda a transição da marca,
// e tem cenário próprio (salas sem marca, local na lixeira, PUT que não menciona
// a marca).

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
 * O que está sob teste aqui é a guarda do checkout e a do vínculo; o cadastro do
 * posto não é. É a mesma escolha do teste das 205 localizações: `createMany` em
 * vez de 205 `POST`, porque o que se exercita é outra coisa.
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
    assetTag: `POSTO-${String(contador).padStart(3, '0')}`,
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
 * É PRÉ-CONDIÇÃO, e por isso é asserção e não `void`: sem ela, um vínculo que
 * falha por qualquer razão deixa o ativo SEM máquina em silêncio, e o caso
 * seguinte falha dizendo "esperava 409, recebeu 201" — uma falha que não fala do
 * que o teste investiga. Foi um 429 do teto que ensinou isso; o teto saiu, e a
 * asserção fica, porque a lição não era sobre o teto.
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

describe('invariante 19 — o que libera a vaga do posto', () => {
  it('re-vincular a MESMA máquina ao computador do posto não recusa a si mesmo', async () => {
    // É o único caminho em que o `assetId` excluído da busca carrega peso: o
    // `vincularEndpointAoAtivo` deixa passar a mesma máquina no mesmo ativo, e
    // sem a exclusão esse ativo seria encontrado como "o computador que já está
    // lá" — a operação responderia 409 contra si mesma.
    const posto = await criarPosto('Mesa do Re-vínculo');

    const computador = await ativo('Desktop do re-vínculo');
    const { endpointId } = await darMaquinaOuFalhar(computador.id, 'revinculo-um');
    expect((await entregarAoPosto(computador.id, posto)).status).toBe(201);

    const denovo = await api.post(`/api/endpoints/${endpointId}/link`, { assetId: computador.id });
    expect(denovo.status).toBe(201);
  });

  it('desvincular a máquina do computador do posto libera a vaga', async () => {
    // O espelho do caso da devolução, pela OUTRA porta: é o fluxo de trocar a
    // máquina de um posto sem devolver o ativo.
    const posto = await criarPosto('Mesa da Troca de Máquina');

    const velho = await ativo('Desktop de máquina velha');
    const { endpointId } = await darMaquinaOuFalhar(velho.id, 'troca-maquina-velha');
    expect((await entregarAoPosto(velho.id, posto)).status).toBe(201);

    const novo = await ativo('Desktop de máquina nova');
    await darMaquinaOuFalhar(novo.id, 'troca-maquina-nova');
    expect((await entregarAoPosto(novo.id, posto)).status).toBe(409);

    // Tirar a máquina do primeiro faz dele um ativo-sem-máquina: ele continua
    // no posto, e deixa de ser o computador dele.
    expect((await api.delete(`/api/endpoints/${endpointId}/link`)).status).toBe(200);

    expect((await entregarAoPosto(novo.id, posto)).status).toBe(201);
  });

  it('ativo na LIXEIRA com posse aberta não tranca o posto', async () => {
    // O `delete-asset` só carimba `deletedAt` — ele NÃO fecha a posse. Sem o
    // `deletedAt: null` no filtro aninhado (que a softDeleteExtension não
    // alcança, porque o topo da consulta é `assignment`), o posto recusaria
    // todo computador novo apontando um ativo que nenhuma tela mostra.
    const posto = await criarPosto('Mesa da Lixeira');

    const sumido = await ativo('Desktop que foi para a lixeira');
    await darMaquinaOuFalhar(sumido.id, 'lixeira-um');
    expect((await entregarAoPosto(sumido.id, posto)).status).toBe(201);
    expect((await api.delete(`/api/assets/${sumido.id}`)).status).toBe(200);

    const novo = await ativo('Desktop que chega depois');
    await darMaquinaOuFalhar(novo.id, 'lixeira-dois');
    expect((await entregarAoPosto(novo.id, posto)).status).toBe(201);
  });

  it('devolver o computador libera o posto para outro', async () => {
    const posto = await criarPosto('Mesa que troca');

    const velho = await ativo('Desktop velho');
    await darMaquinaOuFalhar(velho.id, 'troca-velho');
    expect((await entregarAoPosto(velho.id, posto)).status).toBe(201);

    const novo = await ativo('Desktop novo');
    await darMaquinaOuFalhar(novo.id, 'troca-novo');
    expect((await entregarAoPosto(novo.id, posto)).status).toBe(409);

    expect((await api.post(`/api/assets/${velho.id}/checkin`, {})).status).toBe(200);

    expect((await entregarAoPosto(novo.id, posto)).status).toBe(201);
  });
});
