import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../server/core/database/prismaClient';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import { conectarAgente, esperarPor } from '../helpers/agente';
import { criarAtivo, criarFabricante, criarModelo, idsDoSeed } from '../helpers/fixtures';

// INVARIANTE 19 — o que LIBERA a vaga de computador do posto.
//
// A regra é "no máximo um", não "exatamente um": o posto pode ficar sem
// computador, e os quatro caminhos que abrem a vaga precisam funcionar, ou a
// regra tranca o posto em vez de protegê-lo.
//
// Irmão de `computador-por-posto.test.ts`, que cobre as duas portas que
// RECUSAM. A divisão é pelo teto de escrita: 40 por minuto por INSTÂNCIA da
// aplicação, e a instância é por arquivo de teste.

const PREFIXO = 'B';

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
