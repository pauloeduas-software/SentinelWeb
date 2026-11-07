import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import { cenarioDePosse, criarItemDeEstoque, diaNoBrasil } from '../helpers/fixtures';

// A LINHA DO TEMPO DO POSTO — `GET /api/workstations/:id/history` (BP).
//
// TRÊS fontes, uma lista: quem entrou e saiu, o computador entregue e devolvido, e o
// estoque entregue à mesa. E a aba Responsáveis fica só com quem está agora: as
// ocupações encerradas moram aqui.

interface Evento {
  id: string;
  fonte: 'OCUPACAO' | 'POSSE' | 'ESTOQUE';
  action: string;
  at: string;
  ocupacao: { personLabel: string; shift: string | null; notes: string | null } | null;
  posse: { assetLabel: string; notes: string | null } | null;
  estoque: { itemLabel: string; unidades: number; notes: string | null } | null;
}

interface Envelope {
  total: number;
  rows: Evento[];
}

let api: ApiDeTeste;
let cenario: Awaited<ReturnType<typeof cenarioDePosse>>;

beforeAll(async () => {
  api = await criarApi();
  cenario = await cenarioDePosse(api);
});

afterAll(async () => {
  await api.fechar();
});

const historico = async (posto: string, query = '') => {
  const { status, body } = await api.get<Envelope>(`/api/workstations/${posto}/history${query}`);
  expect(status).toBe(200);
  return body;
};

const ocupar = async (posto: string, personId: string, corpo: Record<string, unknown> = {}) => {
  const { status, body } = await api.post<{ id: string }>(`/api/workstations/${posto}/occupants`, { personId, ...corpo });
  expect(status).toBe(201);
  return body.id;
};

describe('o histórico do posto', () => {
  it('junta quem entrou e saiu, o computador e o estoque, do mais recente para o mais antigo', async () => {
    const mesa = cenario.mesa1;
    const ocupacao = await ocupar(mesa, cenario.laura, {
      shift: 'Manhã', notes: 'Cobre as férias', startedAt: diaNoBrasil(-10),
    });

    expect((await api.post(`/api/assets/${cenario.ativo.id}/checkout`, {
      targetType: 'WORKSTATION', targetWorkstationId: mesa, checkoutAt: diaNoBrasil(-8), checkoutNotes: 'Montado na mesa',
    })).status).toBe(201);

    const mouse = await criarItemDeEstoque(api, { name: 'Mouse da mesa', categoryId: cenario.categoriaEstoqueId, qty: 3 });
    const entrega = await api.post<{ unidades: { id: string }[] }>(`/api/stock/items/${mouse.id}/checkout`, {
      targetType: 'WORKSTATION', targetWorkstationId: mesa, qty: 2, checkoutAt: diaNoBrasil(-6), notes: 'Para a escala',
    });
    expect(entrega.status).toBe(201);

    const devolvida = await api.post(`/api/stock/checkouts/${entrega.body.unidades[0].id}/checkin`, {
      qty: 2, checkinAt: diaNoBrasil(-4),
    });
    expect(devolvida.status).toBe(200);

    expect((await api.post(`/api/assets/${cenario.ativo.id}/checkin`, {
      checkinAt: diaNoBrasil(-3), checkinNotes: 'Trocado',
    })).status).toBe(200);

    expect((await api.delete(`/api/workstations/${mesa}/occupants/${ocupacao}`, { endedAt: diaNoBrasil(-2) })).status).toBe(200);

    const { total, rows } = await historico(mesa);
    expect(total).toBe(6);
    expect(rows.map((evento) => [evento.fonte, evento.action])).toEqual([
      ['OCUPACAO', 'END'],
      ['POSSE', 'CHECKIN'],
      ['ESTOQUE', 'CHECKIN'],
      ['ESTOQUE', 'CHECKOUT'],
      ['POSSE', 'CHECKOUT'],
      ['OCUPACAO', 'CREATE'],
    ]);

    const [saiu, devolveu, , recebeu, entregue, entrou] = rows;
    expect(entrou.ocupacao).toMatchObject({ personLabel: 'Laura Souza', shift: 'Manhã', notes: 'Cobre as férias' });
    expect(saiu.ocupacao).toMatchObject({ personLabel: 'Laura Souza', shift: 'Manhã' });
    expect(entregue.posse?.assetLabel).toContain(cenario.ativo.assetTag);
    expect(entregue.posse?.notes).toBe('Montado na mesa');
    expect(devolveu.posse?.notes).toBe('Trocado');
    expect(recebeu.estoque).toMatchObject({ itemLabel: 'Mouse da mesa', unidades: 2, notes: 'Para a escala' });
  });

  it('traz só o que passou por este posto, e não o que está no nome de quem o ocupa', async () => {
    const outro = await cenarioDePosse(api, ' (so-este-posto)');
    const noNome = await criarItemDeEstoque(api, { name: 'Headset no nome', categoryId: outro.categoriaEstoqueId, qty: 1 });
    expect((await api.post(`/api/stock/items/${noNome.id}/checkout`, {
      targetType: 'PERSON', targetPersonId: outro.laura, qty: 1,
    })).status).toBe(201);
    await ocupar(outro.mesa1, outro.laura);

    const { total, rows } = await historico(outro.mesa1);
    expect(total).toBe(1);
    expect(rows[0].fonte).toBe('OCUPACAO');
  });

  it('o consumível entra só com a entrega: ele não volta', async () => {
    const outro = await cenarioDePosse(api, ' (consumivel)');
    const pilha = await criarItemDeEstoque(api, { name: 'Pilha da mesa', categoryId: outro.categoriaConsumivelId, qty: 4 });
    expect((await api.post(`/api/stock/items/${pilha.id}/checkout`, {
      targetType: 'WORKSTATION', targetWorkstationId: outro.mesa1, qty: 2,
    })).status).toBe(201);

    const { rows } = await historico(outro.mesa1);
    expect(rows.map((evento) => [evento.fonte, evento.action])).toEqual([['ESTOQUE', 'CHECKOUT']]);
  });

  it('pagina depois de juntar as fontes, e o total conta tudo', async () => {
    const outro = await cenarioDePosse(api, ' (paginacao)');
    await ocupar(outro.mesa1, outro.laura, { startedAt: diaNoBrasil(-3) });
    await ocupar(outro.mesa1, outro.ana, { startedAt: diaNoBrasil(-2) });
    expect((await api.post(`/api/assets/${outro.ativo.id}/checkout`, {
      targetType: 'WORKSTATION', targetWorkstationId: outro.mesa1, checkoutAt: diaNoBrasil(-1),
    })).status).toBe(201);

    const primeira = await historico(outro.mesa1, '?limit=2&page=1');
    const segunda = await historico(outro.mesa1, '?limit=2&page=2');
    expect(primeira.total).toBe(3);
    expect(primeira.rows.map((evento) => evento.fonte)).toEqual(['POSSE', 'OCUPACAO']);
    expect(segunda.rows.map((evento) => evento.ocupacao?.personLabel)).toEqual(['Laura Souza (paginacao)']);
  });

  it('o posto novo tem histórico vazio; o que não existe é 404, e parâmetro estranho é 422', async () => {
    const outro = await cenarioDePosse(api, ' (vazio)');
    expect(await historico(outro.mesa1)).toEqual({ total: 0, rows: [] });

    expect((await api.get('/api/workstations/00000000-0000-4000-8000-000000000000/history')).status).toBe(404);
    expect((await api.get(`/api/workstations/${outro.mesa1}/history?xpto=1`)).status).toBe(422);
  });
});

describe('a aba Responsáveis fica com quem está agora', () => {
  it('quem saiu só aparece no histórico, e a rota não tem mais `?view=`', async () => {
    const outro = await cenarioDePosse(api, ' (so-agora)');
    const saiu = await ocupar(outro.mesa1, outro.laura);
    await ocupar(outro.mesa1, outro.ana);
    expect((await api.delete(`/api/workstations/${outro.mesa1}/occupants/${saiu}`)).status).toBe(200);

    const agora = await api.get<{ person: { name: string } }[]>(`/api/workstations/${outro.mesa1}/occupants`);
    expect(agora.body.map((ocupacao) => ocupacao.person.name)).toEqual(['Ana Lima (so-agora)']);

    const { rows } = await historico(outro.mesa1);
    expect(rows.filter((evento) => evento.ocupacao?.personLabel === 'Laura Souza (so-agora)').map((evento) => evento.action).sort())
      .toEqual(['CREATE', 'END']);

    expect((await api.get(`/api/workstations/${outro.mesa1}/occupants?view=all`)).status).toBe(422);
  });
});
