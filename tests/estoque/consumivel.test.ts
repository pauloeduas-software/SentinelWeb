import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../server/core/database/prismaClient';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import {
  cenarioDePosse, criarAtivo, criarColaborador, criarItemDeEstoque, criarPosto, diaNoBrasil,
} from '../helpers/fixtures';

// O CONSUMÍVEL (AJ) — o item de estoque cuja CATEGORIA é do tipo Consumível: o
// toner, a pilha. Vai a colaborador ou posto, como o estoque, mas não volta: a
// entrega tira do total na hora, não fica "em uso", não tem devolução e não
// prende ninguém. O histórico mostra só a entrega.

let api: ApiDeTeste;
let cenario: Awaited<ReturnType<typeof cenarioDePosse>>;

beforeAll(async () => {
  api = await criarApi();
  cenario = await cenarioDePosse(api);
});

afterAll(async () => {
  await api.fechar();
});

const consumivel = (name: string, qty: number) =>
  criarItemDeEstoque(api, { name, categoryId: cenario.categoriaConsumivelId, qty });

const entregar = (itemId: string, corpo: Record<string, unknown>) =>
  api.post<{ unidades: { id: string; returnedAt: string | null }[]; disponivel: number; error: string }>(
    `/api/stock/items/${itemId}/checkout`, corpo,
  );

const lerItem = (itemId: string) =>
  api.get<{ qty: number; emUso: number; disponivel: number; jaEntregue: boolean }>(`/api/stock/items/${itemId}`);

describe('a entrega tira do total e não fica com ninguém', () => {
  it('o total cai, nada fica em uso, e "Com quem está" fica vazio', async () => {
    const toner = await consumivel('Toner da entrega', 10);
    const entrega = await entregar(toner.id, { targetType: 'PERSON', targetPersonId: cenario.laura, qty: 3 });

    expect(entrega.status).toBe(201);
    expect(entrega.body.disponivel).toBe(7);
    expect(entrega.body.unidades.every((unidade) => unidade.returnedAt !== null)).toBe(true);
    expect((await lerItem(toner.id)).body).toMatchObject({ qty: 7, emUso: 0, disponivel: 7, jaEntregue: true });
    expect((await api.get<{ total: number }>(`/api/stock/items/${toner.id}/checkouts`)).body.total).toBe(0);

    const linhas = await prisma.stockMovement.findMany({ where: { itemId: toner.id }, select: { returnKind: true } });
    expect(linhas.map((linha) => linha.returnKind)).toEqual(['CONSUMED', 'CONSUMED', 'CONSUMED']);
  });

  it('vai para um posto também, e o dia pode ser passado', async () => {
    const pilha = await consumivel('Pilha do posto', 4);
    const entrega = await entregar(pilha.id, {
      targetType: 'WORKSTATION', targetWorkstationId: cenario.mesa1, qty: 2, checkoutAt: diaNoBrasil(-3),
    });
    expect(entrega.status).toBe(201);
    expect((await lerItem(pilha.id)).body).toMatchObject({ qty: 2, disponivel: 2 });
  });

  it('não vai para computador (422)', async () => {
    const pilha = await consumivel('Pilha do computador', 4);
    const pc = await criarAtivo(api, { statusId: cenario.statusDeployableId, modelId: cenario.modelId, name: 'Sem pilha' });
    const recusa = await entregar(pilha.id, { targetType: 'ASSET', targetAssetId: pc.id });
    expect(recusa.status).toBe(422);
    expect((await lerItem(pilha.id)).body.qty).toBe(4);
  });

  it('acaba no 0, e a frase manda somar a compra — não devolver', async () => {
    const toner = await consumivel('Toner que acaba', 2);
    expect((await entregar(toner.id, { targetType: 'PERSON', targetPersonId: cenario.laura, qty: 2 })).status).toBe(201);
    expect((await lerItem(toner.id)).body).toMatchObject({ qty: 0, disponivel: 0 });

    const sem = await entregar(toner.id, { targetType: 'PERSON', targetPersonId: cenario.laura });
    expect(sem.status).toBe(409);
    expect(sem.body.error).toBe('Sem unidade disponível de "Toner que acaba": 0 no total. Aumente o total quando comprar mais.');

    const mais = await consumivel('Toner que não cabe', 2);
    const pouco = await entregar(mais.id, { targetType: 'PERSON', targetPersonId: cenario.laura, qty: 3 });
    expect(pouco.status).toBe(409);
    expect(pouco.body.error).toBe('Sem unidade suficiente de "Toner que não cabe": a entrega pede 3 e há 2 disponíveis (2 no total).');
  });

  it('não tem devolução: 409, e o total não volta', async () => {
    const toner = await consumivel('Toner sem volta', 3);
    const entrega = await entregar(toner.id, { targetType: 'PERSON', targetPersonId: cenario.laura });

    const recusa = await api.post<{ error: string }>(`/api/stock/checkouts/${entrega.body.unidades[0].id}/checkin`, {});
    expect(recusa.status).toBe(409);
    expect(recusa.body.error).toBe('"Toner sem volta" é consumível: a entrega não volta.');
    expect((await lerItem(toner.id)).body.qty).toBe(2);
  });
});

describe('não prende ninguém', () => {
  it('o colaborador que recebeu se desativa, e a ficha não mostra o consumível', async () => {
    const pessoa = await criarColaborador(api, { name: 'Caio do Toner', email: 'caio.toner@teste.local' });
    const toner = await consumivel('Toner do Caio', 2);
    expect((await entregar(toner.id, { targetType: 'PERSON', targetPersonId: pessoa })).status).toBe(201);

    expect((await api.get<{ itens: unknown[] }>(`/api/people/${pessoa}`)).body.itens).toEqual([]);
    expect((await api.put(`/api/people/${pessoa}`, { isActive: false })).status).toBe(200);
  });

  it('o posto que recebeu se exclui', async () => {
    const mesa = await criarPosto(api, { name: 'Mesa do papel' });
    const pilha = await consumivel('Pilha da mesa excluída', 2);
    expect((await entregar(pilha.id, { targetType: 'WORKSTATION', targetWorkstationId: mesa })).status).toBe(201);
    expect((await api.delete(`/api/workstations/${mesa}`)).status).toBeLessThan(300);
  });

  it('o item se exclui, e o histórico da pessoa continua dizendo o nome', async () => {
    const pessoa = await criarColaborador(api, { name: 'Lia da Pilha', email: 'lia.pilha@teste.local' });
    const pilha = await consumivel('Pilha excluída', 2);
    expect((await entregar(pilha.id, { targetType: 'PERSON', targetPersonId: pessoa })).status).toBe(201);
    expect((await api.delete(`/api/stock/items/${pilha.id}`)).status).toBe(204);

    type Historico = { rows: { fonte: string; action: string; estoque: { itemLabel: string } | null }[] };
    const daPessoa = (await api.get<Historico>(`/api/people/${pessoa}/history`)).body.rows.filter((e) => e.fonte === 'ESTOQUE');
    expect(daPessoa.map((e) => [e.action, e.estoque?.itemLabel])).toEqual([['CHECKOUT', 'Pilha excluída']]);
  });
});

describe('o histórico mostra só a entrega', () => {
  it('no item e no colaborador, sem devolução', async () => {
    const pessoa = await criarColaborador(api, { name: 'Rui do Toner', email: 'rui.toner@teste.local' });
    const toner = await consumivel('Toner do histórico', 5);
    expect((await entregar(toner.id, { targetType: 'PERSON', targetPersonId: pessoa, qty: 2 })).status).toBe(201);

    const doItem = await api.get<{ total: number; rows: { action: string; unidades: number }[] }>(
      `/api/stock/items/${toner.id}/history`,
    );
    expect(doItem.body.total).toBe(1);
    expect(doItem.body.rows.map((e) => [e.action, e.unidades])).toEqual([['CHECKOUT', 2]]);

    type Historico = { rows: { fonte: string; action: string }[] };
    const daPessoa = (await api.get<Historico>(`/api/people/${pessoa}/history`)).body.rows.filter((e) => e.fonte === 'ESTOQUE');
    expect(daPessoa.map((e) => e.action)).toEqual(['CHECKOUT']);
  });
});

describe('a categoria', () => {
  it('o item passa de estoque a consumível só sem unidade em uso, e de consumível a estoque sempre', async () => {
    const mouse = await criarItemDeEstoque(api, { name: 'Mouse que vira consumível', categoryId: cenario.categoriaEstoqueId, qty: 3 });
    const entrega = await entregar(mouse.id, { targetType: 'PERSON', targetPersonId: cenario.laura });

    const recusa = await api.put<{ error: string }>(`/api/stock/items/${mouse.id}`, { categoryId: cenario.categoriaConsumivelId });
    expect(recusa.status).toBe(409);
    expect(recusa.body.error).toBe(
      '"Mouse que vira consumível" tem 1 unidade em uso e não pode passar de estoque para consumível. '
      + 'Devolva antes de trocar a categoria.',
    );

    await api.post(`/api/stock/checkouts/${entrega.body.unidades[0].id}/checkin`, {});
    expect((await api.put(`/api/stock/items/${mouse.id}`, { categoryId: cenario.categoriaConsumivelId })).status).toBe(200);

    const toner = await consumivel('Toner que vira estoque', 3);
    expect((await entregar(toner.id, { targetType: 'PERSON', targetPersonId: cenario.laura })).status).toBe(201);
    expect((await api.put(`/api/stock/items/${toner.id}`, { categoryId: cenario.categoriaEstoqueId })).status).toBe(200);
  });

  it('o seletor de categoria do item oferece o consumível', async () => {
    const opcoes = await api.get<{ id: string }[]>('/api/categories/options?type=STOCK,COMPONENT,CONSUMABLE');
    expect(opcoes.status).toBe(200);
    expect(opcoes.body.map((opcao) => opcao.id)).toContain(cenario.categoriaConsumivelId);
  });
});
