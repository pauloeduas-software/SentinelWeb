import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../server/core/database/prismaClient';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import { criarAtivo, criarFabricante, criarModelo, idsDoSeed } from '../helpers/fixtures';

// INVARIANTE 19 — no máximo UM ativo por posto de trabalho.
//
// Ativo é computador: o que não é máquina (monitor, teclado, mouse) é estoque,
// por quantidade, e não passa por aqui. A regra vale só onde `isWorkstation` é
// verdade, e não depende de a máquina estar vinculada ao ativo — o agente
// instalado ou não não muda o que o equipamento é.
//
// O primeiro `describe` é a porta da ENTREGA, que recusa. O segundo cobre o
// outro lado: a regra é "no máximo um", não "exatamente um", e os caminhos que
// LIBERAM a vaga precisam funcionar, ou a regra tranca o posto em vez de
// protegê-lo. O terceiro é a porta da RESTAURAÇÃO — a entrada no posto outra
// vez, pela porta de trás.
//
// A porta da MARCA — marcar como posto um local que já tem dois ativos — fica
// em `ativo-por-posto-marca.test.ts`. Aquela separação é por ASSUNTO: ela não
// guarda a entrada do ativo no posto, guarda a transição da marca, e tem cenário
// próprio (salas sem marca, ativo na lixeira, PUT que não menciona a marca).

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
async function criarPosto(name: string, isWorkstation = true) {
  const criado = await prisma.location.create({ data: { name, isWorkstation }, select: { id: true } });
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

async function entregarAoPosto(assetId: string, locationId: string) {
  return api.post<{ error: string; assetId?: string }>(`/api/assets/${assetId}/checkout`, {
    targetType: 'LOCATION',
    targetLocationId: locationId,
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
    expect(body.assetId).toBe(primeiro.id);
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

  it('dois ativos na SALA DE REUNIÃO passam: a regra é só do posto marcado', async () => {
    const sala = await criarPosto('Sala de Reunião', false);

    const um = await ativo('Desktop da sala 1');
    expect((await entregarAoPosto(um.id, sala)).status).toBe(201);

    const dois = await ativo('Desktop da sala 2');
    expect((await entregarAoPosto(dois.id, sala)).status).toBe(201);
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

  it('ativo na LIXEIRA com posse aberta não tranca o posto', async () => {
    // O `delete-asset` só carimba `deletedAt` — ele NÃO fecha a posse. Sem o
    // `deletedAt: null` no filtro aninhado (que a softDeleteExtension não
    // alcança, porque o topo da consulta é `assignment`), o posto recusaria
    // todo ativo novo apontando um ativo que nenhuma tela mostra.
    const posto = await criarPosto('Mesa da Lixeira');

    const sumido = await ativo('Desktop que foi para a lixeira');
    expect((await entregarAoPosto(sumido.id, posto)).status).toBe(201);
    expect((await api.delete(`/api/assets/${sumido.id}`)).status).toBe(200);

    const novo = await ativo('Desktop que chega depois');
    expect((await entregarAoPosto(novo.id, posto)).status).toBe(201);
  });
});

describe('invariante 19 — a porta da RESTAURAÇÃO', () => {
  // O `delete-asset` só carimba `deletedAt` e NÃO fecha a posse, e as outras
  // portas ignoram o ativo na lixeira de propósito (o caso acima). Juntas, as
  // duas decisões abrem o caminho: a vaga é ocupada enquanto o ativo está na
  // lixeira, e restaurá-lo o devolve a uma mesa que já não tem lugar para ele.
  it('recusa restaurar o ativo de um posto que recebeu outro enquanto ele estava na lixeira', async () => {
    const posto = await criarPosto('Mesa da Restauração');

    const antigo = await ativo('Desktop que foi para a lixeira com posse');
    expect((await entregarAoPosto(antigo.id, posto)).status).toBe(201);
    expect((await api.delete(`/api/assets/${antigo.id}`)).status).toBe(200);

    const novo = await ativo('Desktop que entrou no lugar');
    expect((await entregarAoPosto(novo.id, posto)).status).toBe(201);

    const { status, body } = await api.post<{ error: string; assetId?: string }>(
      `/api/assets/${antigo.id}/restore`,
    );

    expect(status).toBe(409);
    // A MESMA frase da entrega, nomeando quem já está lá.
    expect(body.error).toContain(novo.assetTag);
    expect(body.error).toMatch(/j[áa] tem um ativo/i);
    expect(body.assetId).toBe(novo.id);

    // E nada foi gravado: o ativo continua na lixeira. `findUnique` porque o
    // escopo da lixeira não o alcança — é justamente o que se quer ler aqui.
    const depois = await prisma.asset.findUnique({ where: { id: antigo.id }, select: { deletedAt: true } });
    expect(depois?.deletedAt).not.toBeNull();
  });

  it('restaura quando a vaga continua livre', async () => {
    const posto = await criarPosto('Mesa da Restauração Livre');

    const unico = await ativo('Desktop que volta da lixeira');
    expect((await entregarAoPosto(unico.id, posto)).status).toBe(201);
    expect((await api.delete(`/api/assets/${unico.id}`)).status).toBe(200);

    // Ninguém entrou enquanto ele estava fora: a vaga continua dele.
    expect((await api.post(`/api/assets/${unico.id}/restore`)).status).toBe(200);
  });
});
