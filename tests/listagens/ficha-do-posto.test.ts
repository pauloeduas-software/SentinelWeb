import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../server/core/database/prismaClient';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import { conectarAgente, esperarPor } from '../helpers/agente';
import { criarAtivo, criarFabricante, criarModelo, idsDoSeed } from '../helpers/fixtures';

// O QUE A FICHA DO POSTO PRECISA SABER, e que a listagem de ativos não manda.
//
// A ficha de `/postos/:id` mostra a telemetria do computador da mesa e leva de
// volta à ficha de cada ativo. Para isso ela pergunta duas coisas que são de
// rotas diferentes, e as duas nasceram nesta etapa:
//
//   `GET /api/workstations/:id`        — se o ativo da mesa tem MÁQUINA
//                                        vinculada, e qual máquina consultar;
//   `GET /api/assets/:id/assignments`  — se o alvo da posse aberta é um POSTO,
//                                        porque só posto tem ficha para onde ir
//                                        (um depósito também é `Location`).
//
// Arquivo próprio, e não dentro de `ativo-em-posto.test.ts`: aquele prova que o
// ativo entregue SAI da listagem, e é `inject` puro. Estes dois abrem uma porta
// de verdade (o agente fala WebSocket), e o assunto é o que a ficha do posto lê.

let api: ApiDeTeste;
let seed: Awaited<ReturnType<typeof idsDoSeed>>;
let modelId: string;
let contador = 0;

let posto: string;
let deposito: string;

beforeAll(async () => {
  api = await criarApi();
  seed = await idsDoSeed();
  const fabricanteId = await criarFabricante(api, 'Fabricante da Ficha');
  modelId = await criarModelo(api, { categoriaId: seed.categoriaId, fabricanteId });

  const [mesa, dep] = await Promise.all([
    prisma.location.create({ data: { name: 'Mesa da Ficha', isWorkstation: true }, select: { id: true } }),
    prisma.location.create({ data: { name: 'Depósito da Ficha', isWorkstation: false }, select: { id: true } }),
  ]);
  posto = mesa.id;
  deposito = dep.id;
});

afterAll(async () => {
  await api.fechar();
});

async function ativo(nome: string, serial: string) {
  contador += 1;
  return criarAtivo(api, {
    statusId: seed.statusDeployableId,
    modelId,
    name: nome,
    serial,
    assetTag: `FICHA-${String(contador).padStart(3, '0')}`,
  });
}

async function entregarA(assetId: string, locationId: string) {
  const r = await api.post(`/api/assets/${assetId}/checkout`, {
    targetType: 'LOCATION',
    targetLocationId: locationId,
  });
  // Pré-condição afirmada: uma entrega que falha em silêncio faz o caso seguinte
  // falhar dizendo outra coisa.
  expect(r.status, `entrega falhou: ${JSON.stringify(r.body)}`).toBe(201);
  return r;
}

describe('o que a ficha do posto lê', () => {
  it('a ficha do posto diz se o ativo da mesa tem MÁQUINA, e qual', async () => {
    // A ficha mostra a telemetria do computador da mesa, e para isso precisa
    // saber se o ativo entregue tem máquina vinculada — e qual máquina
    // consultar. Sem o `endpointId` por linha, a tela teria que perguntar isso
    // em outra rota. Duas mesas, porque um posto tem um ativo só (invariante
    // 19): a do desktop com agente e a do desktop cujo agente ainda não chegou.
    const [comAgente, semAgente] = await Promise.all([
      prisma.location.create({ data: { name: 'Mesa com agente', isWorkstation: true }, select: { id: true } }),
      prisma.location.create({ data: { name: 'Mesa sem agente', isWorkstation: true }, select: { id: true } }),
    ]);

    const computador = await ativo('Desktop com agente da ficha', 'SN-FICHA-20');
    const semMaquina = await ativo('Desktop sem agente da ficha', 'SN-FICHA-21');

    const agente = await conectarAgente(api, 'maquina-da-ficha-do-posto');
    await agente.handshake({ Hostname: 'pc-da-ficha' });
    const maquina = await esperarPor('a máquina da ficha', () =>
      prisma.endpoint.findUnique({ where: { hwid: 'maquina-da-ficha-do-posto' } }));
    expect((await api.post(`/api/endpoints/${maquina.id}/link`, { assetId: computador.id })).status).toBe(201);
    await agente.fechar();

    await entregarA(computador.id, comAgente.id);
    await entregarA(semMaquina.id, semAgente.id);

    const lerMesa = async (id: string) => (await api.get<{ ativos: { id: string; endpointId: string | null }[] }>(
      `/api/workstations/${id}`,
    )).body.ativos;

    const naComAgente = await lerMesa(comAgente.id);
    expect(naComAgente.map((a) => a.id)).toEqual([computador.id]);
    expect(naComAgente[0].endpointId).toBe(maquina.id);

    // O ATIVO SEM MÁQUINA TEM QUE VIR COM `null`, e não ausente: é a diferença
    // entre "ainda sem agente" e "a tela não sabe". `toBeNull` recusa
    // `undefined`, então esta linha também pega a relação que não foi
    // selecionada.
    const naSemAgente = await lerMesa(semAgente.id);
    expect(naSemAgente.map((a) => a.id)).toEqual([semMaquina.id]);
    expect(naSemAgente[0].endpointId).toBeNull();
  });

  it('a posse aberta diz se o alvo é POSTO, e não só o nome dele', async () => {
    // É o que faz a aba Posse do ativo poder LEVAR até a mesa: `PosseResolvida`
    // carrega o rótulo do alvo e não o id, então o link sai da posse aberta. E
    // `isWorkstation` é o que separa a mesa do DEPÓSITO — mandar um depósito para
    // uma tela chamada "posto" seria o nome errado na cara do usuário.
    const naMesa = await ativo('Desktop do alvo', 'SN-FICHA-30');
    await entregarA(naMesa.id, posto);

    const noDeposito = await ativo('Caixa do depósito', 'SN-FICHA-31');
    await entregarA(noDeposito.id, deposito);

    const daMesa = await api.get<{ targetLocation: { id: string; name: string; isWorkstation: boolean } | null }[]>(
      `/api/assets/${naMesa.id}/assignments`,
    );
    expect(daMesa.body[0].targetLocation).toEqual({
      id: posto,
      name: 'Mesa da Ficha',
      isWorkstation: true,
    });

    const doDeposito = await api.get<{ targetLocation: { isWorkstation: boolean } | null }[]>(
      `/api/assets/${noDeposito.id}/assignments`,
    );
    expect(doDeposito.body[0].targetLocation?.isWorkstation).toBe(false);
  });
});
