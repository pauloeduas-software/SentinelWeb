import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../server/core/database/prismaClient';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import { cenarioDePosse } from '../helpers/fixtures';

// A LINHA DO TEMPO DA PESSOA — `GET /api/people/:id/history`.
//
// SÓ MOVIMENTAÇÃO, e uma fonte a mais que o histórico do ativo tem:
//
//   POSSE      o que ela recebeu e devolveu, com a etiqueta do equipamento;
//   POSTO      onde ela sentou e quando saiu, com o turno.
//
// (As licenças entregues a ela são a terceira fonte, testadas em
// `tests/licencas`.) Cadastro, edição e desativação ficam na auditoria, no
// banco (AB): a ficha não os mostra.

interface Evento {
  id: string;
  fonte: 'POSSE' | 'POSTO' | 'LICENCA';
  action: string;
  at: string;
  posse: { assetLabel: string; notes: string | null } | null;
  posto: { workstationLabel: string; shift: string | null } | null;
}

interface Envelope {
  total: number;
  rows: Evento[];
}

let api: ApiDeTeste;
let cenario: Awaited<ReturnType<typeof cenarioDePosse>>;
let ocupacaoId = '';

beforeAll(async () => {
  api = await criarApi();
  cenario = await cenarioDePosse(api);

  // A HISTÓRIA que o teste vai ler, montada pela API na ordem em que aconteceu.
  const editou = await api.put(`/api/people/${cenario.laura}`, {
    name: 'Laura Souza',
    email: 'laura.souza@teste.local',
  });
  expect(editou.status).toBe(200);

  const ocupou = await api.post<{ id: string }>(`/api/workstations/${cenario.mesa1}/occupants`, {
    personId: cenario.laura,
    shift: 'Manhã',
  });
  expect(ocupou.status).toBe(201);
  ocupacaoId = ocupou.body.id;

  const entregou = await api.post(`/api/assets/${cenario.ativo.id}/checkout`, {
    targetType: 'PERSON',
    targetPersonId: cenario.laura,
    checkoutNotes: 'Kit de onboarding',
  });
  expect(entregou.status).toBe(201);

  const devolveu = await api.post(`/api/assets/${cenario.ativo.id}/checkin`, {});
  expect(devolveu.status).toBe(200);

  const saiu = await api.delete(`/api/workstations/${cenario.mesa1}/occupants/${ocupacaoId}`);
  expect(saiu.status).toBe(200);
});

afterAll(async () => {
  await api.fechar();
});

async function historico(query = ''): Promise<Envelope> {
  const { status, body } = await api.get<Envelope>(`/api/people/${cenario.laura}/history${query}`);
  expect(status).toBe(200);
  return body;
}

const de = (eventos: Evento[], fonte: Evento['fonte']) => eventos.filter((e) => e.fonte === fonte);

describe('as três fontes', () => {
  it('não traz o cadastro nem a edição: eles ficam na auditoria, com a conta', async () => {
    const { rows } = await historico();
    expect(rows.every((e) => e.fonte === 'POSSE' || e.fonte === 'POSTO')).toBe(true);

    const auditoria = await prisma.auditLog.findMany({
      where: { entityType: 'Person', entityId: cenario.laura },
      select: { action: true, actorType: true, actorId: true },
    });
    expect(auditoria.map((l) => l.action)).toEqual(expect.arrayContaining(['CREATE', 'UPDATE']));
    expect(auditoria.every((l) => l.actorType === 'USER' && l.actorId === api.adminId)).toBe(true);
  });

  it('traz a entrega e a devolução, nomeando o EQUIPAMENTO', async () => {
    const { rows } = await historico();
    const posse = de(rows, 'POSSE');

    expect(posse.map((e) => e.action).sort()).toEqual(['CHECKIN', 'CHECKOUT']);

    // Do lado da pessoa a pergunta é "o que ela recebeu?" — o espelho do
    // histórico do ativo, que nomeia o ALVO ("para quem foi?").
    const entrega = posse.find((e) => e.action === 'CHECKOUT');
    expect(entrega?.posse?.assetLabel).toContain(cenario.ativo.assetTag);
    expect(entrega?.posse?.notes).toBe('Kit de onboarding');
  });

  it('traz a entrada e a saída do POSTO, com o turno', async () => {
    const { rows } = await historico();
    const posto = de(rows, 'POSTO');

    expect(posto.map((e) => e.action).sort()).toEqual(['CREATE', 'END']);
    expect(posto.every((e) => e.posto?.workstationLabel === 'Mesa 1')).toBe(true);
    expect(posto.every((e) => e.posto?.shift === 'Manhã')).toBe(true);
  });
});

describe('a lista', () => {
  it('vem do mais recente para o mais antigo', async () => {
    const { rows } = await historico();
    const instantes = rows.map((e) => new Date(e.at).getTime());
    expect(instantes).toEqual([...instantes].sort((a, b) => b - a));
  });

  it('tem chave estável e única — uma posse rende DOIS eventos', async () => {
    const { rows } = await historico();
    expect(new Set(rows.map((e) => e.id)).size).toBe(rows.length);
  });

  it('`total` soma as três fontes, e o `limit` corta só as linhas', async () => {
    const inteiro = await historico();
    const cortado = await historico('?limit=2');

    expect(cortado.rows).toHaveLength(2);
    // O `total` continua contando o universo: é ele que deixa a tela dizer
    // "2 de N" em vez de mentir que são 2.
    expect(cortado.total).toBe(inteiro.total);
    expect(inteiro.total).toBe(inteiro.rows.length);
  });

  it('recusa `limit` acima do teto com 422', async () => {
    const { status } = await api.get(`/api/people/${cenario.laura}/history?limit=500`);
    expect(status).toBe(422);
  });
});

describe('a borda', () => {
  it('responde 404 para pessoa inexistente, não lista vazia', async () => {
    // Lista vazia responderia a duas perguntas diferentes — "nada aconteceu" e
    // "esse id não existe" — e quem chama precisa distinguir as duas.
    const { status } = await api.get('/api/people/11111111-1111-4111-8111-111111111111/history');
    expect(status).toBe(404);
  });

  it('responde 422 para id que não é uuid', async () => {
    const { status } = await api.get('/api/people/nao-e-uuid/history');
    expect(status).toBe(422);
  });

  it('exige sessão', async () => {
    const { status } = await api.anonimo.get(`/api/people/${cenario.laura}/history`);
    expect(status).toBe(401);
  });
});
