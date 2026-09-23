import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import { cenarioDePosse } from '../helpers/fixtures';

// A LINHA DO TEMPO DA PESSOA — `GET /api/users/:id/history`.
//
// TRÊS fontes numa lista só, e é uma a mais que o histórico do ativo tem:
//
//   ATIVIDADE  o `ActivityLog` dela (cadastro, edição com diff, desligamento);
//   POSSE      o que ela recebeu e devolveu, com a etiqueta do equipamento;
//   POSTO      onde ela sentou e quando saiu, com o turno.
//
// A terceira é a que o D25 EXIGE que exista: `LocationOccupant` não ganha
// `openedById`/`closedById` porque "quem cadastrou a Laura na Mesa 1?" é
// pergunta de auditoria, e a decisão mandou a resposta para o `ActivityLog`.
// Sem esta leitura, a decisão teria mandado a pergunta para um lugar que não a
// responde.
//
// AS TRÊS FONTES SÃO DISJUNTAS por construção, e é isso que o teste do `total`
// prova: a entrega é gravada no ATIVO (`entityType: 'Asset'`) e a ocupação na
// OCUPAÇÃO (`entityType: 'LocationOccupant'`) — nenhuma cai numa consulta por
// `entityType: 'User'`. Por isso a soma fecha sem subtrair nada, ao contrário
// do histórico do ativo, que precisa tirar CHECKOUT/CHECKIN do log para não
// contar a mesma entrega duas vezes.

interface Evento {
  id: string;
  fonte: 'ATIVIDADE' | 'POSSE' | 'POSTO';
  action: string;
  at: string;
  actorId: string | null;
  posse: { assetLabel: string; notes: string | null } | null;
  posto: { locationLabel: string; shift: string | null } | null;
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
  await api.put(`/api/users/${cenario.laura}`, {
    name: 'Laura Souza',
    email: 'laura@teste.local',
    department: 'Comercial',
  });

  const ocupou = await api.post<{ id: string }>(`/api/locations/${cenario.mesa1}/occupants`, {
    userId: cenario.laura,
    shift: 'Manhã',
  });
  expect(ocupou.status).toBe(201);
  ocupacaoId = ocupou.body.id;

  const entregou = await api.post(`/api/assets/${cenario.ativo.id}/checkout`, {
    targetType: 'USER',
    targetUserId: cenario.laura,
    checkoutNotes: 'Kit de onboarding',
  });
  expect(entregou.status).toBe(201);

  const devolveu = await api.post(`/api/assets/${cenario.ativo.id}/checkin`, {});
  expect(devolveu.status).toBe(200);

  const saiu = await api.delete(`/api/locations/${cenario.mesa1}/occupants/${ocupacaoId}`);
  expect(saiu.status).toBe(200);
});

afterAll(async () => {
  await api.fechar();
});

async function historico(query = ''): Promise<Envelope> {
  const { status, body } = await api.get<Envelope>(`/api/users/${cenario.laura}/history${query}`);
  expect(status).toBe(200);
  return body;
}

const de = (eventos: Evento[], fonte: Evento['fonte']) => eventos.filter((e) => e.fonte === fonte);

describe('as três fontes', () => {
  it('traz o cadastro e a edição, com o ator da sessão', async () => {
    const { rows } = await historico();
    const atividade = de(rows, 'ATIVIDADE');

    expect(atividade.map((e) => e.action)).toEqual(expect.arrayContaining(['CREATE', 'UPDATE']));
    // O ator da F3 chega a tudo que passou por uma requisição autenticada.
    expect(atividade.every((e) => e.actorId === api.adminId)).toBe(true);
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
    expect(posto.every((e) => e.posto?.locationLabel === 'Mesa 1')).toBe(true);
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
    const { status } = await api.get(`/api/users/${cenario.laura}/history?limit=500`);
    expect(status).toBe(422);
  });
});

describe('a borda', () => {
  it('responde 404 para pessoa inexistente, não lista vazia', async () => {
    // Lista vazia responderia a duas perguntas diferentes — "nada aconteceu" e
    // "esse id não existe" — e quem chama precisa distinguir as duas.
    const { status } = await api.get('/api/users/11111111-1111-4111-8111-111111111111/history');
    expect(status).toBe(404);
  });

  it('responde 422 para id que não é uuid', async () => {
    const { status } = await api.get('/api/users/nao-e-uuid/history');
    expect(status).toBe(422);
  });

  it('exige sessão', async () => {
    const { status } = await api.anonimo.get(`/api/users/${cenario.laura}/history`);
    expect(status).toBe(401);
  });
});
