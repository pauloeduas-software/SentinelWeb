import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../server/core/database/prismaClient';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import { cenarioDePosse, criarPosto } from '../helpers/fixtures';

// CORRIGIR O TURNO DE UMA OCUPAÇÃO ABERTA — `PATCH /api/workstations/:id/occupants/:occupantId`.
//
// O use-case existia desde a F10 e não tinha rota. O que ele resolve é o typo:
// "manha" cadastrado, "manhã" correto. As duas alternativas erradas estão
// argumentadas no cabeçalho dele — encerrar e reabrir fabrica histórico falso, e
// recusar deixa o cadastro errado para sempre.
//
// O que este arquivo fixa: a correção é um UPDATE com trilha, ela NÃO mexe no
// `startedAt`, ela recusa ocupação encerrada, e ela é ESCOPADA PELO POSTO da URL.

let api: ApiDeTeste;
let cenario: Awaited<ReturnType<typeof cenarioDePosse>>;

beforeAll(async () => {
  api = await criarApi();
  cenario = await cenarioDePosse(api);
});

afterAll(async () => {
  await api.fechar();
});

interface Ocupacao {
  id: string;
  shift: string | null;
  startedAt: string;
  endedAt: string | null;
}

/**
 * Um posto NOVO com uma ocupação aberta — um par por caso.
 *
 * Posto próprio e não o `mesa1` do cenário porque a invariante 2 recusa a MESMA
 * pessoa duas vezes no mesmo posto: reaproveitar o par faria o segundo caso
 * receber 409 do cadastro e seguir com um `id` indefinido, falhando depois no
 * uuid do param — uma falha que não fala do que o teste investiga.
 *
 * O 201 é exigido aqui, por isso: cadastro que não aconteceu precisa falhar
 * ALTO, e no lugar certo.
 */
let contador = 0;
async function postoComOcupacao(shift: string | null) {
  contador += 1;
  const postoId = await criarPosto(api, { name: `Mesa do Turno ${contador}` });

  const { status, body } = await api.post<Ocupacao>(`/api/workstations/${postoId}/occupants`, {
    personId: cenario.laura,
    shift,
  });
  expect(status, `ocupação não abriu: ${JSON.stringify(body)}`).toBe(201);

  return { postoId, ocupacao: body };
}

describe('PATCH /api/workstations/:id/occupants/:occupantId', () => {
  it('corrige o turno e mantém a MESMA linha, com o mesmo início', async () => {
    const { postoId, ocupacao: aberta } = await postoComOcupacao('manha');

    const { status, body } = await api.patch<Ocupacao>(
      `/api/workstations/${postoId}/occupants/${aberta.id}`,
      { shift: 'Manhã' },
    );

    expect(status).toBe(200);
    expect(body.id).toBe(aberta.id);
    expect(body.shift).toBe('Manhã');
    // O início NÃO se move: é isso que separa a correção de "encerrar e reabrir".
    expect(body.startedAt).toBe(aberta.startedAt);
    expect(body.endedAt).toBeNull();
  });

  it('deixa a trilha com o de/para do turno', async () => {
    const { postoId, ocupacao: aberta } = await postoComOcupacao('tarde');
    const { status } = await api.patch(
      `/api/workstations/${postoId}/occupants/${aberta.id}`,
      { shift: 'Tarde' },
    );
    // Sem esta linha, um 422 apareceria como "o log é null", que não diz o que
    // quebrou.
    expect(status).toBe(200);

    const log = await prisma.activityLog.findFirst({
      where: { entityType: 'WorkstationOccupant', entityId: aberta.id, action: 'UPDATE' },
      orderBy: { createdAt: 'desc' },
      select: { changes: true },
    });

    expect(log).not.toBeNull();
    expect(log?.changes).toEqual({ shift: { de: 'tarde', para: 'Tarde' } });
  });

  it('aceita `null` para apagar o turno', async () => {
    const { postoId, ocupacao: aberta } = await postoComOcupacao('A definir');
    const { status, body } = await api.patch<Ocupacao>(
      `/api/workstations/${postoId}/occupants/${aberta.id}`,
      { shift: null },
    );

    expect(status).toBe(200);
    expect(body.shift).toBeNull();
  });

  it('campo limpo pelo formulário vira `null`, não string vazia', async () => {
    // É o corpo que a tela manda quando alguém apaga o campo: `''`, não `null`.
    const { postoId, ocupacao: aberta } = await postoComOcupacao('Manhã');
    const vazio = await api.patch<Ocupacao>(
      `/api/workstations/${postoId}/occupants/${aberta.id}`,
      { shift: '' },
    );
    expect(vazio.status).toBe(200);
    expect(vazio.body.shift).toBeNull();

    // E só espaços também: o `trim` corre antes.
    const branco = await postoComOcupacao('Tarde');
    const so_espacos = await api.patch<Ocupacao>(
      `/api/workstations/${branco.postoId}/occupants/${branco.ocupacao.id}`,
      { shift: '   ' },
    );
    expect(so_espacos.status).toBe(200);
    expect(so_espacos.body.shift).toBeNull();
  });

  it('turno acima do teto de 60 é 422', async () => {
    const { postoId, ocupacao: aberta } = await postoComOcupacao('Manhã');

    const { status } = await api.patch(
      `/api/workstations/${postoId}/occupants/${aberta.id}`,
      { shift: 'x'.repeat(61) },
    );
    expect(status).toBe(422);
  });

  it('recusa ocupação ENCERRADA com 409: histórico não se edita', async () => {
    const { postoId, ocupacao: aberta } = await postoComOcupacao('Manhã');
    await api.delete(`/api/workstations/${postoId}/occupants/${aberta.id}`);

    const { status, body } = await api.patch<{ error: string }>(
      `/api/workstations/${postoId}/occupants/${aberta.id}`,
      { shift: 'Tarde' },
    );

    expect(status).toBe(409);
    expect(body.error).toMatch(/encerrada/i);
  });

  it('é ESCOPADA PELO POSTO: o id de outro posto na URL dá 404 e nada muda', async () => {
    const { ocupacao: aberta } = await postoComOcupacao('Manhã');
    const outroPosto = await criarPosto(api, { name: 'Mesa de Outro Posto' });

    const { status } = await api.patch(
      `/api/workstations/${outroPosto}/occupants/${aberta.id}`,
      { shift: 'Noite' },
    );

    expect(status).toBe(404);

    const depois = await prisma.workstationOccupant.findUniqueOrThrow({
      where: { id: aberta.id },
      select: { shift: true },
    });
    expect(depois.shift).toBe('Manhã');
  });

  it('corpo sem `shift` é 422: um PATCH de um campo só não aceita silêncio', async () => {
    const { postoId, ocupacao: aberta } = await postoComOcupacao('Manhã');

    const { status } = await api.patch(
      `/api/workstations/${postoId}/occupants/${aberta.id}`,
      {},
    );
    expect(status).toBe(422);
  });
});
