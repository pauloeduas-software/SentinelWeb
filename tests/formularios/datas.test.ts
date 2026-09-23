import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import { cenarioDePosse, criarAtivo, criarColaborador, criarLocal } from '../helpers/fixtures';

// AS DUAS BORDAS DO CALENDÁRIO — `dataNaoFutura` e `dataNaoPassada`.
//
// São a MESMA regra vista dos dois lados, e por isso moram no mesmo arquivo
// (`server/domain/shared/fields.schema.ts`) e são provadas no mesmo lugar:
//
//   ocupação    recusa o FUTURO  — uma linha com `endedAt IS NULL` já conta
//               como ocupante ATUAL em toda consulta e no índice único
//               parcial. "Começa semana que vem" gravaria como presente quem
//               ninguém vê no posto, e bloquearia o cadastro de quem está lá.
//
//   devolução   recusa o PASSADO — uma entrega com prazo para ontem NASCE
//   prevista    vencida: entra em `/api/assignments/overdue` no mesmo segundo
//               e, com o lembrete automático da Leva 3, cobraria de volta o
//               que acabou de sair do estoque.
//
// HOJE é aceito nos dois: "ocupa desde hoje" e "devolve hoje" são pedidos
// legítimos, e a comparação é contra meia-noite UTC — a mesma referência que o
// `dataOpcional` usa para construir o valor, senão a borda mudaria de lugar
// conforme o fuso de quem roda o teste.

let api: ApiDeTeste;
let cenario: Awaited<ReturnType<typeof cenarioDePosse>>;

// UM cenário por arquivo. O harness limpa e semeia o banco por ARQUIVO, não por
// teste, e `cenarioDePosse` cria nomes fixos ("Mesa 1", laura@teste.local) —
// chamá-lo duas vezes colide no índice único e o erro chega como falha de
// fixture, longe da asserção que ele deveria explicar.
//
// O que cada teste cria é o ATIVO, porque a regra do índice parcial só deixa
// UMA posse aberta por ativo: reaproveitar o mesmo faria o segundo checkout
// responder 409 antes de o zod olhar a data.
beforeAll(async () => {
  api = await criarApi();
  cenario = await cenarioDePosse(api);
});

/** Um ativo novo no estoque, para cada entrega ter o seu. */
async function ativoNovo() {
  const { id } = await criarAtivo(api, {
    statusId: cenario.statusDeployableId,
    modelId: cenario.modelId,
  });
  return id;
}

afterAll(async () => {
  await api.fechar();
});

/** 'AAAA-MM-DD' de N dias a partir de hoje, em UTC. */
function dia(delta: number): string {
  const data = new Date();
  data.setUTCHours(0, 0, 0, 0);
  data.setUTCDate(data.getUTCDate() + delta);
  return data.toISOString().slice(0, 10);
}

describe('devolução prevista', () => {
  it('recusa ONTEM com 422, e a mensagem diz o que está errado', async () => {
    const { status, body } = await api.post<{ error: string }>(
      `/api/assets/${await ativoNovo()}/checkout`,
      { targetType: 'USER', targetUserId: cenario.laura, expectedCheckinAt: dia(-1) },
    );

    expect(status).toBe(422);
    expect(body.error).toMatch(/passada/i);
  });

  it('aceita HOJE — "devolve hoje" é prazo legítimo', async () => {
    const { status } = await api.post(`/api/assets/${await ativoNovo()}/checkout`, {
      targetType: 'USER',
      targetUserId: cenario.laura,
      expectedCheckinAt: dia(0),
    });

    expect(status).toBe(201);
  });

  it('aceita o FUTURO, que é o caso normal do empréstimo', async () => {
    const { status } = await api.post(`/api/assets/${await ativoNovo()}/checkout`, {
      targetType: 'USER',
      targetUserId: cenario.laura,
      expectedCheckinAt: dia(30),
    });

    expect(status).toBe(201);
  });

  it('aceita a entrega SEM prazo — equipamento de trabalho não tem devolução marcada', async () => {
    const { status } = await api.post(`/api/assets/${await ativoNovo()}/checkout`, {
      targetType: 'USER',
      targetUserId: cenario.laura,
    });

    expect(status).toBe(201);
  });

  it('a entrega EM MASSA herda a mesma recusa', async () => {
    // O `bulkCheckoutSchema` estende o `checkoutSchema` em vez de repetir os
    // campos, exatamente para a regra não valer só num dos dois caminhos.
    const { status, body } = await api.post<{ error: string }>('/api/assets/bulk-checkout', {
      targetType: 'USER',
      targetUserId: cenario.laura,
      assetIds: [await ativoNovo(), await ativoNovo()],
      expectedCheckinAt: dia(-5),
    });

    expect(status).toBe(422);
    expect(body.error).toMatch(/passada/i);
  });
});

describe('início da ocupação', () => {
  it('recusa AMANHÃ com 422 — escala futura é agenda, e agenda está fora do modelo', async () => {
    const [mesa, pessoa] = await Promise.all([
      criarLocal(api, { name: 'Mesa do futuro', isWorkstation: true }),
      criarColaborador(api, { name: 'Pessoa do futuro', email: 'futuro@teste.local' }),
    ]);

    const { status, body } = await api.post<{ error: string }>(`/api/locations/${mesa}/occupants`, {
      userId: pessoa,
      startedAt: dia(1),
    });

    expect(status).toBe(422);
    expect(body.error).toMatch(/futura/i);
  });

  it('aceita o PASSADO — a carga inicial é "ocupa a Mesa 1 desde março"', async () => {
    const [mesa, pessoa] = await Promise.all([
      criarLocal(api, { name: 'Mesa do passado', isWorkstation: true }),
      criarColaborador(api, { name: 'Pessoa do passado', email: 'passado@teste.local' }),
    ]);

    const { status } = await api.post(`/api/locations/${mesa}/occupants`, {
      userId: pessoa,
      startedAt: dia(-180),
    });

    expect(status).toBe(201);
  });
});
