import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../server/infra/database/prismaClient';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import { criarAtivo, criarFabricante, criarModelo, criarPosto, idsDoSeed } from '../helpers/fixtures';

// A CORRIDA DA INVARIANTE 19 — dois ativos entregues ao mesmo posto, ao mesmo
// tempo.
//
// O `if` do use-case é o que as duas requisições atravessam juntas em READ
// COMMITTED. O índice `assignments_um_aberto_por_posto` seguraria a segunda,
// mas a perdedora receberia a frase genérica, sem saber qual computador
// devolver.
//
// É por isso que o helper trava a linha do posto com `FOR UPDATE`. Este arquivo
// é a prova de que ela trava: a perdedora recebe o 409 da porta, com o
// computador que está na mesa.

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

// EXCLUIR O POSTO E ENTREGAR A ELE AO MESMO TEMPO. A exclusão trava o posto
// antes de contar o uso, e a entrega lê o posto travado: uma das duas espera a
// outra. Ou o posto sai e a entrega recebe 404, ou a entrega passa e a exclusão
// recebe o 409 que diz o que tirar — nunca a frase genérica da FK.
describe('excluir o posto e entregar a ele, ao mesmo tempo', () => {
  it('uma das duas espera a outra, e a recusa diz o que fazer', async () => {
    for (let rodada = 1; rodada <= 5; rodada += 1) {
      const posto = await criarPosto(api, { name: `Mesa que sai ${rodada}` });
      const item = await ativo(`Desktop da mesa que sai ${rodada}`);

      const [exclusao, entrega] = await Promise.all([
        api.delete<{ error?: string }>(`/api/workstations/${posto}`),
        entregar(item.id, posto),
      ]);

      if (exclusao.status === 200) {
        expect(entrega.status).toBe(404);
      } else {
        expect(entrega.status).toBe(201);
        expect(exclusao.status).toBe(409);
        expect(exclusao.body.error).toContain('Tire o que está nele agora');
      }
    }
  });
});
