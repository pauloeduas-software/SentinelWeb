import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import { cenarioDePosse, criarAtivo } from '../helpers/fixtures';
import { prisma } from '../../server/core/database/prismaClient';

// AS CORRIDAS — o que "passa no teste com um usuário".
//
// Toda invariante defendida só por `if` de aplicação tem a mesma falha: as duas
// requisições leem "não há posse aberta" ANTES de qualquer uma gravar, e as
// duas passam. Nenhum teste sequencial encontra isso; o bug aparece em produção
// no dia em que duas pessoas clicam junto, e o estado resultante é justamente o
// que nenhuma consulta acusa.
//
// Por isso estes testes disparam as requisições SEM `await` entre elas e
// contam os status. A asserção nunca é "deu certo" — é "exatamente UMA passou,
// e o banco tem exatamente UMA linha".
//
// `Promise.all` sobre `app.inject()` dispara de verdade em paralelo: cada
// `inject` entra no event loop como uma requisição independente e o Prisma tira
// uma conexão do pool para cada uma. Quem serializa é o Postgres, que é
// exatamente o que se quer provar.

let api: ApiDeTeste;
let cenario: Awaited<ReturnType<typeof cenarioDePosse>>;

beforeAll(async () => {
  api = await criarApi();
  cenario = await cenarioDePosse(api);
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

describe('duplo checkout simultâneo do mesmo ativo', () => {
  it('deixa passar exatamente UM', async () => {
    const respostas = await Promise.all([
      api.post(`/api/assets/${cenario.ativo.id}/checkout`, {
        targetType: 'USER',
        targetUserId: cenario.laura,
      }),
      api.post(`/api/assets/${cenario.ativo.id}/checkout`, {
        targetType: 'USER',
        targetUserId: cenario.ana,
      }),
    ]);

    // É o índice único parcial que pega isto — qualquer `if` no use-case
    // deixaria os dois passarem.
    expect(placar(respostas)[201]).toBe(1);

    const abertas = await prisma.assignment.count({
      where: { assetId: cenario.ativo.id, checkinAt: null },
    });
    expect(abertas).toBe(1);
  });

  it('não deixa a corrida perdida gravar posse fechada de consolação', async () => {
    // A recusa tem que ser total: uma `Assignment` com `checkinAt` preenchido
    // criada pela requisição perdedora seria histórico de uma entrega que nunca
    // aconteceu, e o relatório de "quem esteve com este ativo" mentiria.
    const total = await prisma.assignment.count({ where: { assetId: cenario.ativo.id } });
    expect(total).toBe(1);
  });
});

describe('a mesma pessoa cadastrada duas vezes no mesmo posto, ao mesmo tempo', () => {
  it('deixa passar exatamente UMA ocupação', async () => {
    const respostas = await Promise.all([
      api.post(`/api/locations/${cenario.mesa1}/occupants`, { userId: cenario.ana, shift: 'Manhã' }),
      api.post(`/api/locations/${cenario.mesa1}/occupants`, { userId: cenario.ana, shift: 'Tarde' }),
    ]);

    expect(placar(respostas)[201]).toBe(1);

    const abertas = await prisma.locationOccupant.count({
      where: { locationId: cenario.mesa1, userId: cenario.ana, endedAt: null },
    });
    expect(abertas).toBe(1);
  });
});

describe('a etiqueta automática sob concorrência', () => {
  it('não repete número entre criações simultâneas', async () => {
    // O contador vive numa coluna de `AppSetting`. Um `read` + `write` comum
    // daria a MESMA etiqueta a todo mundo que entrasse na janela; o que salva é
    // o `increment` atômico do Postgres.
    const quantos = 8;
    const respostas = await Promise.all(
      Array.from({ length: quantos }, () =>
        criarAtivo(api, { statusId: cenario.statusDeployableId, modelId: cenario.modelId }),
      ),
    );

    const etiquetas = respostas.map((r) => r.assetTag);
    expect(new Set(etiquetas).size).toBe(quantos);

    // E o banco confirma que não houve duplicata escapando por outro caminho.
    const noBanco = await prisma.asset.findMany({
      where: { assetTag: { in: etiquetas } },
      select: { assetTag: true },
    });
    expect(noBanco.length).toBe(quantos);
  });
});

describe('desligar e entregar ao mesmo tempo', () => {
  it('não deixa o desligado terminar com posse aberta', async () => {
    // A corrida mais cara do modelo: o `offboard` lê as posses abertas e as
    // fecha; um checkout que entre DEPOIS dessa leitura e ANTES do commit
    // deixaria o desligado responsável por um equipamento — e o 409 do DELETE
    // passaria a travar o cadastro para sempre, sem ninguém entender por quê.
    const pessoa = cenario.ana;
    const ativo = await criarAtivo(api, {
      statusId: cenario.statusDeployableId,
      modelId: cenario.modelId,
      name: 'Notebook da corrida de desligamento',
    });

    const [entrega, desligamento] = await Promise.all([
      api.post(`/api/assets/${ativo.id}/checkout`, { targetType: 'USER', targetUserId: pessoa }),
      api.post(`/api/users/${pessoa}/offboard`, { notes: 'corrida' }),
    ]);

    // Qualquer uma das duas pode ganhar — o que NÃO pode é o estado final ter
    // as duas coisas verdadeiras.
    expect([200, 201, 409]).toContain(entrega.status);
    expect([200, 409]).toContain(desligamento.status);

    const desligada = await prisma.user.findFirstOrThrow({
      where: { id: pessoa },
      select: { terminatedAt: true },
    });

    if (desligada.terminatedAt) {
      const posses = await prisma.assignment.count({
        where: { targetType: 'USER', targetUserId: pessoa, checkinAt: null },
      });
      const ocupacoes = await prisma.locationOccupant.count({
        where: { userId: pessoa, endedAt: null },
      });

      // Desligada COM posse aberta é o estado proibido.
      expect({ posses, ocupacoes }).toEqual({ posses: 0, ocupacoes: 0 });
    }
  });
});
