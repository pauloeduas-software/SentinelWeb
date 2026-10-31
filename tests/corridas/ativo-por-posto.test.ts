import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../server/infra/database/prismaClient';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import { criarAtivo, criarFabricante, criarModelo, criarPosto, idsDoSeed } from '../helpers/fixtures';

// A CORRIDA DA INVARIANTE 19 — dois ativos entregues ao mesmo posto, ao mesmo
// tempo.
//
// Esta é a invariante que NÃO tem rede no banco: a regra cruza `assignments` e
// `assets`, e o índice único da posse aberta é por ativo, não por posto. Então o `if` do
// use-case é tudo que existe — e `if` de aplicação é exatamente o que as duas
// requisições atravessam juntas em READ COMMITTED.
//
// É por isso que o helper trava a linha do posto com `FOR UPDATE`. Este arquivo
// é a prova de que ela trava: sem o `FOR UPDATE`, as duas entregas passam e o
// posto fica com dois ativos.

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

/** Um ativo disponível. */
async function ativo(nome: string) {
  contador += 1;
  return criarAtivo(api, {
    statusId: seed.statusDeployableId,
    modelId,
    name: nome,
    assetTag: `CORRIDA-${String(contador).padStart(4, '0')}`,
  });
}

const entregar = (assetId: string, workstationId: string) =>
  api.post(`/api/assets/${assetId}/checkout`, { targetType: 'WORKSTATION', targetWorkstationId: workstationId });

describe('dois ativos entregues ao MESMO posto, ao mesmo tempo', () => {
  it('deixa passar exatamente UM', async () => {
    const posto = await criarPosto(api, { name: 'Mesa da Corrida' });
    const um = await ativo('Desktop A');
    const dois = await ativo('Desktop B');

    // SEM `await` entre as duas: é o `Promise.all` que as põe no event loop
    // juntas, cada uma com sua conexão do pool. Quem serializa é o Postgres.
    const respostas = await Promise.all([entregar(um.id, posto), entregar(dois.id, posto)]);

    expect(placar(respostas)[201]).toBe(1);
    expect(placar(respostas)[409]).toBe(1);

    const noPosto = await prisma.assignment.count({ where: { targetWorkstationId: posto, checkinAt: null } });
    expect(noPosto).toBe(1);
  });

  it('e a perdedora não deixa posse fechada de consolação', async () => {
    const posto = await criarPosto(api, { name: 'Mesa da Corrida 2' });
    const um = await ativo('Desktop C');
    const dois = await ativo('Desktop D');

    await Promise.all([entregar(um.id, posto), entregar(dois.id, posto)]);

    // A recusa tem que ser TOTAL: uma `Assignment` com `checkinAt` preenchido
    // seria histórico de uma entrega que nunca aconteceu.
    const total = await prisma.assignment.count({ where: { targetWorkstationId: posto } });
    expect(total).toBe(1);
  });

});
