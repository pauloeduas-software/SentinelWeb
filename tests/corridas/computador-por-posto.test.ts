import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../server/core/database/prismaClient';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import { conectarAgente, esperarPor } from '../helpers/agente';
import { criarAtivo, criarFabricante, criarLocal, criarModelo, idsDoSeed } from '../helpers/fixtures';

// A CORRIDA DA INVARIANTE 19 — dois computadores entregues ao mesmo posto, ao
// mesmo tempo.
//
// Esta é a invariante que NÃO tem rede no banco: a regra cruza `assignments`,
// `assets` e `endpoints`, e índice único é sobre uma tabela só. Então o `if` do
// use-case é tudo que existe — e `if` de aplicação é exatamente o que as duas
// requisições atravessam juntas em READ COMMITTED.
//
// É por isso que o helper trava a linha do posto com `FOR UPDATE`. Este arquivo
// é a prova de que ela trava: sem o `FOR UPDATE`, as duas entregas passam e o
// posto fica com dois computadores.

let api: ApiDeTeste;
let seed: Awaited<ReturnType<typeof idsDoSeed>>;
let modelId: string;
let contador = 0;

beforeAll(async () => {
  api = await criarApi();
  seed = await idsDoSeed();
  const fabricanteId = await criarFabricante(api, 'Fabricante da Corrida');
  modelId = await criarModelo(api, { categoriaId: seed.categoriaId, fabricanteId });
});

afterAll(async () => {
  await api.fechar();
});

/** Quantas respostas de cada status — é a única forma da asserção de corrida. */
function placar(respostas: { status: number }[]): Record<number, number> {
  const contagem: Record<number, number> = {};
  for (const r of respostas) contagem[r.status] = (contagem[r.status] ?? 0) + 1;
  return contagem;
}

/** Um ativo disponível COM máquina vinculada — ou seja, um computador. */
async function computador(nome: string, hwid: string) {
  contador += 1;
  const ativo = await criarAtivo(api, {
    statusId: seed.statusDeployableId,
    modelId,
    name: nome,
    assetTag: `CORRIDA-${String(contador).padStart(4, '0')}`,
  });

  const agente = await conectarAgente(api, hwid);
  await agente.handshake({ Hostname: `pc-${hwid}` });
  const maquina = await esperarPor(`a máquina ${hwid}`, () =>
    prisma.endpoint.findUnique({ where: { hwid } }));
  await agente.fechar();

  const vinculo = await api.post(`/api/endpoints/${maquina.id}/link`, { assetId: ativo.id });
  expect(vinculo.status, `vínculo de ${hwid} falhou`).toBe(201);

  return ativo;
}

describe('dois computadores entregues ao MESMO posto, ao mesmo tempo', () => {
  it('deixa passar exatamente UM', async () => {
    const posto = await criarLocal(api, { name: 'Mesa da Corrida', isWorkstation: true });
    const um = await computador('Desktop A', 'corrida-a');
    const dois = await computador('Desktop B', 'corrida-b');

    // SEM `await` entre as duas: é o `Promise.all` que as põe no event loop
    // juntas, cada uma com sua conexão do pool. Quem serializa é o Postgres.
    const respostas = await Promise.all([
      api.post(`/api/assets/${um.id}/checkout`, {
        targetType: 'LOCATION',
        targetLocationId: posto,
      }),
      api.post(`/api/assets/${dois.id}/checkout`, {
        targetType: 'LOCATION',
        targetLocationId: posto,
      }),
    ]);

    expect(placar(respostas)[201]).toBe(1);
    expect(placar(respostas)[409]).toBe(1);

    const computadoresNoPosto = await prisma.assignment.count({
      where: {
        targetLocationId: posto,
        checkinAt: null,
        asset: { endpoint: { isNot: null } },
      },
    });
    expect(computadoresNoPosto).toBe(1);
  });

  it('e a perdedora não deixa posse fechada de consolação', async () => {
    const posto = await criarLocal(api, { name: 'Mesa da Corrida 2', isWorkstation: true });
    const um = await computador('Desktop C', 'corrida-c');
    const dois = await computador('Desktop D', 'corrida-d');

    await Promise.all([
      api.post(`/api/assets/${um.id}/checkout`, { targetType: 'LOCATION', targetLocationId: posto }),
      api.post(`/api/assets/${dois.id}/checkout`, { targetType: 'LOCATION', targetLocationId: posto }),
    ]);

    // A recusa tem que ser TOTAL: uma `Assignment` com `checkinAt` preenchido
    // seria histórico de uma entrega que nunca aconteceu.
    const total = await prisma.assignment.count({ where: { targetLocationId: posto } });
    expect(total).toBe(1);
  });

  it('o posto NÃO marcado deixa os dois passarem, mesmo na corrida', async () => {
    const sala = await criarLocal(api, { name: 'Sala da Corrida', isWorkstation: false });
    const um = await computador('Desktop E', 'corrida-e');
    const dois = await computador('Desktop F', 'corrida-f');

    const respostas = await Promise.all([
      api.post(`/api/assets/${um.id}/checkout`, { targetType: 'LOCATION', targetLocationId: sala }),
      api.post(`/api/assets/${dois.id}/checkout`, { targetType: 'LOCATION', targetLocationId: sala }),
    ]);

    // A trava serializa as duas, mas a regra não se aplica: as duas entram.
    expect(placar(respostas)[201]).toBe(2);
  });
});
