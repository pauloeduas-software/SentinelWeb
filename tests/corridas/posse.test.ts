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
        targetType: 'PERSON',
        targetPersonId: cenario.laura,
      }),
      api.post(`/api/assets/${cenario.ativo.id}/checkout`, {
        targetType: 'PERSON',
        targetPersonId: cenario.ana,
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
      api.post(`/api/workstations/${cenario.mesa1}/occupants`, { personId: cenario.ana, shift: 'Manhã' }),
      api.post(`/api/workstations/${cenario.mesa1}/occupants`, { personId: cenario.ana, shift: 'Tarde' }),
    ]);

    expect(placar(respostas)[201]).toBe(1);

    const abertas = await prisma.workstationOccupant.count({
      where: { workstationId: cenario.mesa1, personId: cenario.ana, endedAt: null },
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

describe('edição do ativo para status de ESTOQUE × entrega, ao mesmo tempo', () => {
  it('nunca termina com posse aberta E status disponível', async () => {
    // Sem a trava do ativo nos dois lados, a edição lia "sem posse", a entrega
    // confirmava, e o `UPDATE` da edição gravava o status de estoque por cima
    // de um ativo já entregue — o estado que a invariante 4 proíbe e que
    // nenhuma recusa acusou. Um SEGUNDO status disponível faz a edição ser uma
    // troca de verdade (a guarda só olha quando o status muda).
    const outro = await api.post<{ id: string }>('/api/status-labels', { name: 'Prateleira B', type: 'DEPLOYABLE' });
    expect(outro.status).toBe(201);

    // Várias rodadas: a ordem de chegada varia, e a asserção vale para todas.
    for (let rodada = 0; rodada < 8; rodada += 1) {
      const ativo = await criarAtivo(api, { statusId: cenario.statusDeployableId, modelId: cenario.modelId });

      const [edicao, entrega] = await Promise.all([
        api.put(`/api/assets/${ativo.id}`, { statusId: outro.body.id }),
        api.post(`/api/assets/${ativo.id}/checkout`, { targetType: 'PERSON', targetPersonId: cenario.laura }),
      ]);
      // A entrega sempre passa (o status das duas pontas é disponível); a
      // edição passa se chegou antes e leva 409 se chegou depois.
      expect(entrega.status).toBe(201);
      expect([200, 409]).toContain(edicao.status);

      const [abertas, final] = await Promise.all([
        prisma.assignment.count({ where: { assetId: ativo.id, checkinAt: null } }),
        prisma.asset.findUniqueOrThrow({ where: { id: ativo.id }, select: { status: { select: { type: true } } } }),
      ]);
      expect(abertas).toBe(1);
      expect(final.status.type).not.toBe('DEPLOYABLE');
    }
  });
});

describe('baixa × entrega do mesmo ativo, ao mesmo tempo', () => {
  it('nunca termina baixado E entregue', async () => {
    // Sem a trava do ativo na baixa, as duas liam "sem posse" e "sem baixa" e
    // passavam: o notebook ficava vendido e na mão da Laura ao mesmo tempo.
    for (let rodada = 0; rodada < 8; rodada += 1) {
      const ativo = await criarAtivo(api, { statusId: cenario.statusDeployableId, modelId: cenario.modelId });

      const [baixa, entrega] = await Promise.all([
        api.post(`/api/assets/${ativo.id}/retire`, { retiredReason: 'VENDIDO' }),
        api.post(`/api/assets/${ativo.id}/checkout`, { targetType: 'PERSON', targetPersonId: cenario.laura }),
      ]);
      // Exatamente uma vence: a que chegar depois encontra a outra feita e
      // leva 409.
      expect((baixa.status === 409) !== (entrega.status === 409)).toBe(true);

      const [abertas, final] = await Promise.all([
        prisma.assignment.count({ where: { assetId: ativo.id, checkinAt: null } }),
        prisma.asset.findUniqueOrThrow({ where: { id: ativo.id }, select: { retiredAt: true } }),
      ]);
      expect(abertas > 0 && final.retiredAt !== null).toBe(false);
    }
  });
});

describe('duas devoluções do mesmo ativo, ao mesmo tempo', () => {
  it('exatamente uma passa, e o histórico tem um CHECKIN só', async () => {
    // Sem a trava do ativo na devolução, as duas liam a mesma posse aberta e
    // respondiam 200 — duas linhas de CHECKIN para uma devolução.
    for (let rodada = 0; rodada < 6; rodada += 1) {
      const ativo = await criarAtivo(api, { statusId: cenario.statusDeployableId, modelId: cenario.modelId });
      const entrega = await api.post(`/api/assets/${ativo.id}/checkout`, { targetType: 'PERSON', targetPersonId: cenario.laura });
      expect(entrega.status).toBe(201);

      const respostas = await Promise.all([
        api.post(`/api/assets/${ativo.id}/checkin`, {}),
        api.post(`/api/assets/${ativo.id}/checkin`, {}),
      ]);
      expect(respostas.map((r) => r.status).sort()).toEqual([200, 409]);

      const checkins = await prisma.auditLog.count({ where: { entityId: ativo.id, action: 'CHECKIN' } });
      expect(checkins).toBe(1);
    }
  });
});
