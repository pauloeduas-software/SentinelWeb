import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../server/core/database/prismaClient';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import { criarAtivo, criarFabricante, criarModelo, idsDoSeed } from '../helpers/fixtures';

// INVARIANTE 19 — no máximo UM ativo por posto de trabalho.
//
// Ativo é computador: o que não é máquina (monitor, teclado, mouse) é estoque,
// por quantidade, e não passa por aqui. A regra vale para todo posto, e não
// depende de a máquina estar vinculada ao ativo — o agente instalado ou não não
// muda o que o equipamento é.
//
// O primeiro `describe` é a porta da ENTREGA, que recusa. O segundo cobre o
// outro lado: a regra é "no máximo um", não "exatamente um", e os caminhos que
// LIBERAM a vaga precisam funcionar, ou a regra tranca o posto em vez de
// protegê-lo. A lixeira não é porta de trás: o ativo entregue não vai para ela
// (AL).

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
 * O que está sob teste aqui é a guarda da entrega; o cadastro do posto não é. É
 * a mesma escolha do teste das 205 localizações: `createMany` em vez de 205
 * `POST`, porque o que se exercita é outra coisa.
 */
async function criarPosto(name: string) {
  const criado = await prisma.workstation.create({
    data: { name, location: { create: { name: `Local de ${name}` } } },
    select: { id: true },
  });
  return criado.id;
}

/** Um ativo disponível. */
async function ativo(nome: string) {
  contador += 1;
  return criarAtivo(api, {
    statusId: seed.statusDeployableId,
    modelId,
    name: nome,
    assetTag: `POSTO-${String(contador).padStart(3, '0')}`,
  });
}

async function entregarAoPosto(assetId: string, workstationId: string) {
  return api.post<{ error: string; assetId?: string }>(`/api/assets/${assetId}/checkout`, {
    targetType: 'WORKSTATION',
    targetWorkstationId: workstationId,
  });
}

describe('invariante 19 — no máximo um ativo por posto', () => {
  it('a porta da ENTREGA recusa o segundo ativo, dizendo qual já está lá', async () => {
    const posto = await criarPosto('Mesa Um Ativo');

    const primeiro = await ativo('Desktop da Mesa');
    expect((await entregarAoPosto(primeiro.id, posto)).status).toBe(201);

    const segundo = await ativo('Outro Desktop');
    const { status, body } = await entregarAoPosto(segundo.id, posto);

    expect(status).toBe(409);
    // A mensagem NOMEIA o ativo que já está no posto: sem isso, quem está na
    // tela não sabe o que devolver.
    expect(body.error).toContain(primeiro.assetTag);
    expect(body.error).toMatch(/j[áa] tem um ativo/i);
  });

  it('recusa o segundo desktop mesmo SEM agente: a regra é sobre o ATIVO', async () => {
    // Era o contorno que uma segunda porta, no vínculo, fechava: entregar ao
    // posto o desktop SEM agente e vincular depois. Com a regra sobre o ativo,
    // o segundo desktop é recusado na entrega, tenha agente ou não — e o vínculo
    // deixou de ter porta, porque não muda o que o ativo é. O caso COM agente,
    // e o de desvincular não liberar a vaga, estão em
    // `descoberta/vincular-e-entregar.test.ts`, que é quem sobe agente.
    const posto = await criarPosto('Mesa sem Agente');

    const comAgentePorVir = await ativo('Desktop cujo agente ainda não chegou');
    expect((await entregarAoPosto(comAgentePorVir.id, posto)).status).toBe(201);

    const segundo = await ativo('Segundo desktop sem agente');
    expect((await entregarAoPosto(segundo.id, posto)).status).toBe(409);
  });
});

describe('invariante 19 — o que libera a vaga do posto', () => {
  it('devolver o ativo libera o posto para outro', async () => {
    const posto = await criarPosto('Mesa que troca');

    const velho = await ativo('Desktop velho');
    expect((await entregarAoPosto(velho.id, posto)).status).toBe(201);

    const novo = await ativo('Desktop novo');
    expect((await entregarAoPosto(novo.id, posto)).status).toBe(409);

    // Trocar o computador da mesa É devolver o antigo e entregar o novo: não
    // há mais o atalho de desvincular a máquina do antigo e entregar o novo por
    // cima — o antigo continuaria sendo um ativo na mesa.
    expect((await api.post(`/api/assets/${velho.id}/checkin`, {})).status).toBe(200);

    expect((await entregarAoPosto(novo.id, posto)).status).toBe(201);
  });

  it('o ativo entregue ao posto não vai para a lixeira; devolvido, vai e volta (AL)', async () => {
    // A lixeira não contorna a regra: sem esta recusa, o ativo ia para ela
    // ainda no posto, a vaga ficava para outro, e a restauração o devolvia a
    // uma mesa que já não tinha lugar.
    const posto = await criarPosto('Mesa da Lixeira');

    const unico = await ativo('Desktop que não vai para a lixeira');
    expect((await entregarAoPosto(unico.id, posto)).status).toBe(201);

    const recusa = await api.delete<{ error: string }>(`/api/assets/${unico.id}`);
    expect(recusa.status).toBe(409);
    expect(recusa.body.error).toBe('Este ativo está entregue e não pode ir para a lixeira. Faça a devolução antes.');
    const linha = await prisma.asset.findUnique({ where: { id: unico.id }, select: { deletedAt: true } });
    expect(linha?.deletedAt).toBeNull();

    expect((await api.post(`/api/assets/${unico.id}/checkin`, {})).status).toBe(200);
    expect((await api.delete(`/api/assets/${unico.id}`)).status).toBe(200);
    expect((await api.post(`/api/assets/${unico.id}/restore`)).status).toBe(200);
  });
});
