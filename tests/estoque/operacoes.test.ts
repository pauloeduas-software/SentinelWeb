import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import {
  cenarioDePosse, criarColaborador, criarItemDeEstoque, criarLocal, criarPosto, diaNoBrasil,
} from '../helpers/fixtures';

// AS OPERAÇÕES DO ESTOQUE do lado de quem LÊ: a listagem com a conta e as abas,
// "com quem está" e o histórico do detalhe, as fichas do posto e da pessoa, e o
// dia da entrega e da devolução — a mesma forma da licença (AE).
//
// A regra do diretório `listagens/` vale aqui: toda asserção diz as duas
// metades — o que apareceu e o que NÃO apareceu —, porque um filtro errado para
// mais não quebra nada: ele some com a linha, e a tela fica plausível.

let api: ApiDeTeste;
let cenario: Awaited<ReturnType<typeof cenarioDePosse>>;

beforeAll(async () => {
  api = await criarApi();
  cenario = await cenarioDePosse(api);
});

afterAll(async () => {
  await api.fechar();
});

const item = (name: string, qty: number) =>
  criarItemDeEstoque(api, { name, categoryId: cenario.categoriaEstoqueId, qty });

const entregar = (itemId: string, corpo: Record<string, unknown>) =>
  api.post<{ unidades: { id: string; checkoutAt: string }[]; disponivel: number; error: string }>(
    `/api/stock/items/${itemId}/checkout`, corpo,
  );

const devolver = (saidaId: string, corpo: Record<string, unknown> = {}) =>
  api.post<{ devolvidas: number; ficaram: number; returnedAt: string; error: string }>(
    `/api/stock/checkouts/${saidaId}/checkin`, corpo,
  );

interface Saida { id: string; targetLabel: string; unidades: number; checkoutAt: string; notes: string | null }
interface Evento { id: string; action: string; at: string; unidades: number; targetLabel: string; notes: string | null }

describe('a listagem', () => {
  it('traz o total, o que está em uso e o disponível por linha, calculados em lote', async () => {
    const mouse = await item('Mouse da listagem', 4);
    const teclado = await item('Teclado da listagem', 2);
    expect((await entregar(mouse.id, { targetType: 'PERSON', targetPersonId: cenario.laura, qty: 3 })).status).toBe(201);

    const { status, body } = await api.get<{ rows: { id: string; qty: number; emUso: number; disponivel: number; jaEntregue: boolean }[] }>(
      '/api/stock/items?perPage=100',
    );
    expect(status).toBe(200);
    const porId = new Map(body.rows.map((r) => [r.id, r]));
    expect(porId.get(mouse.id)).toMatchObject({ qty: 4, emUso: 3, disponivel: 1, jaEntregue: true });
    expect(porId.get(teclado.id)).toMatchObject({ qty: 2, emUso: 0, disponivel: 2, jaEntregue: false });
  });

  it('a busca acha pelo nome, pela categoria e pela localização', async () => {
    const deposito = await criarLocal(api, { name: 'Almoxarifado Norte' });
    const categoria = await api.post<{ id: string }>('/api/categories', { name: 'Periféricos da busca', type: 'STOCK' });
    const guardado = await api.post<{ id: string }>('/api/stock/items', {
      name: 'Hub guardado', categoryId: cenario.categoriaEstoqueId, qty: 1, locationId: deposito,
    });
    expect(guardado.status).toBe(201);
    const outro = await criarItemDeEstoque(api, { name: 'Webcam da busca', categoryId: categoria.body.id, qty: 1 });

    const ids = async (q: string) =>
      (await api.get<{ rows: { id: string }[] }>(`/api/stock/items?q=${encodeURIComponent(q)}`)).body.rows.map((r) => r.id);

    expect(await ids('hub guard')).toEqual([guardado.body.id]);
    const pelaLocalizacao = await ids('almoxarifado norte');
    expect(pelaLocalizacao).toContain(guardado.body.id);
    expect(pelaLocalizacao).not.toContain(outro.id);

    const pelaCategoria = await ids('periféricos da busca');
    expect(pelaCategoria).toEqual([outro.id]);
  });

  it('o desativado continua na mesma lista, com a conta — sem abas, como nas Configurações', async () => {
    const parado = await item('Projetor desativado sem uso', 1);
    const naRua = await item('Leitor desativado em uso', 2);
    expect((await entregar(naRua.id, { targetType: 'PERSON', targetPersonId: cenario.ana })).status).toBe(201);
    for (const { id } of [parado, naRua]) {
      expect((await api.put(`/api/stock/items/${id}`, { isActive: false })).status).toBe(200);
    }

    const { body } = await api.get<{ rows: { id: string; isActive: boolean; emUso: number }[] }>('/api/stock/items?perPage=100');
    const porId = new Map(body.rows.map((linha) => [linha.id, linha]));
    expect(porId.get(parado.id)).toMatchObject({ isActive: false, emUso: 0 });
    expect(porId.get(naRua.id)).toMatchObject({ isActive: false, emUso: 1 });

    // As abas e o filtro saíram, e a lixeira não existe: a chave é 422, e não
    // uma lista em silêncio diferente da pedida.
    for (const query of ['view=desativados', 'emUso=sim', 'view=trashed']) {
      expect((await api.get(`/api/stock/items?${query}`)).status).toBe(422);
    }
  });
});

describe('com quem está', () => {
  it('uma linha por SAÍDA, com quantas unidades dela ainda estão fora', async () => {
    const mouse = await item('Mouse das saídas', 10);
    const mesa = await entregar(mouse.id, {
      targetType: 'WORKSTATION', targetWorkstationId: cenario.mesa1, qty: 5, notes: 'laboratório',
    });
    expect(mesa.status).toBe(201);
    expect(mesa.body.unidades).toHaveLength(5);
    expect(mesa.body.disponivel).toBe(5);
    // O mesmo alvo recebe de novo: é OUTRA saída, e não a mesma somada.
    expect((await entregar(mouse.id, { targetType: 'WORKSTATION', targetWorkstationId: cenario.mesa1, qty: 2 })).status).toBe(201);
    expect((await entregar(mouse.id, { targetType: 'PERSON', targetPersonId: cenario.laura })).status).toBe(201);

    const { status, body } = await api.get<{ total: number; rows: Saida[] }>(`/api/stock/items/${mouse.id}/checkouts`);
    expect(status).toBe(200);
    expect(body.total).toBe(3);
    expect(body.rows.map((s) => [s.targetLabel, s.unidades]).sort()).toEqual([
      ['Laura Souza', 1], ['Mesa 1', 2], ['Mesa 1', 5],
    ]);
    expect(body.rows.find((s) => s.unidades === 5)?.notes).toBe('laboratório');
  });

  it('15 por página, e a busca acha pelo nome de quem recebeu', async () => {
    const cabo = await item('Cabo das quinze saídas', 20);
    const pessoas = await Promise.all(Array.from({ length: 17 }, (_, i) =>
      criarColaborador(api, { name: `Recebedor ${String(i).padStart(2, '0')}`, email: `recebedor${i}@teste.local` })));
    for (const pessoa of pessoas) {
      expect((await entregar(cabo.id, { targetType: 'PERSON', targetPersonId: pessoa })).status).toBe(201);
    }

    const primeira = await api.get<{ total: number; rows: Saida[] }>(`/api/stock/items/${cabo.id}/checkouts`);
    expect(primeira.body.total).toBe(17);
    expect(primeira.body.rows).toHaveLength(15);
    const segunda = await api.get<{ rows: Saida[] }>(`/api/stock/items/${cabo.id}/checkouts?page=2`);
    expect(segunda.body.rows).toHaveLength(2);
    const todas = [...primeira.body.rows, ...segunda.body.rows].map((s) => s.id);
    expect(new Set(todas).size).toBe(17);

    const busca = await api.get<{ rows: Saida[] }>(`/api/stock/items/${cabo.id}/checkouts?q=recebedor%2003`);
    expect(busca.body.rows.map((s) => s.targetLabel)).toEqual(['Recebedor 03']);
  });

  it('a devolução pergunta quantas: por padrão todas, e a parcial deixa o resto na linha', async () => {
    const fone = await item('Fone da devolução parcial', 5);
    const saida = await entregar(fone.id, { targetType: 'WORKSTATION', targetWorkstationId: cenario.mesa1, qty: 4 });
    // Qualquer unidade da saída serve de `:id`: é a saída que volta.
    const qualquer = saida.body.unidades[2].id;

    const parcial = await devolver(qualquer, { qty: 3 });
    expect(parcial.status).toBe(200);
    expect(parcial.body).toMatchObject({ devolvidas: 3, ficaram: 1 });
    const depois = await api.get<{ rows: Saida[] }>(`/api/stock/items/${fone.id}/checkouts`);
    expect(depois.body.rows.map((s) => s.unidades)).toEqual([1]);

    // Mais do que ficou é 409 com a conta; o resto, sem `qty`, volta inteiro.
    const demais = await devolver(qualquer, { qty: 2 });
    expect(demais.status).toBe(409);
    expect(demais.body.error).toMatch(/Só 1 unidade desta entrega .* ainda está com Mesa 1/);
    expect((await devolver(qualquer)).body).toMatchObject({ devolvidas: 1, ficaram: 0 });
    expect((await api.get<{ rows: Saida[] }>(`/api/stock/items/${fone.id}/checkouts`)).body.rows).toEqual([]);

    const repetida = await devolver(qualquer);
    expect(repetida.status).toBe(409);
    expect(repetida.body.error).toMatch(/já foi devolvida/);
    expect((await devolver('00000000-0000-0000-0000-000000000000')).status).toBe(404);
  });
});

describe('o histórico', () => {
  it('a saída de N é UM evento, e cada devolução é o seu — com o nome e a observação', async () => {
    const dock = await item('Dock do histórico', 6);
    const saida = await entregar(dock.id, {
      targetType: 'PERSON', targetPersonId: cenario.laura, qty: 3, notes: 'home office', checkoutAt: diaNoBrasil(-5),
    });
    expect((await devolver(saida.body.unidades[0].id, { qty: 1, checkinAt: diaNoBrasil(-2) })).status).toBe(200);
    expect((await devolver(saida.body.unidades[0].id, { qty: 2 })).status).toBe(200);

    const { body } = await api.get<{ total: number; rows: Evento[] }>(`/api/stock/items/${dock.id}/history`);
    expect(body.total).toBe(3);
    expect(body.rows.map((e) => [e.action, e.unidades, e.targetLabel])).toEqual([
      ['CHECKIN', 2, 'Laura Souza'],
      ['CHECKIN', 1, 'Laura Souza'],
      ['CHECKOUT', 3, 'Laura Souza'],
    ]);
    expect(body.rows[2].notes).toBe('home office');
    expect(body.rows[0].notes).toBeNull();
  });

  it('duas devoluções da mesma saída no mesmo dia passado são DOIS eventos — no item e na pessoa', async () => {
    // O dia passado é sempre o meio-dia de Brasília: agrupar a devolução pelo
    // dia juntava as duas num "Devolvida · 2 unidades".
    const pessoa = await criarColaborador(api, { name: 'Davi das Devoluções', email: 'davi.devolucoes@teste.local' });
    const cabo = await item('Cabo das duas devoluções', 3);
    const saida = await entregar(cabo.id, { targetType: 'PERSON', targetPersonId: pessoa, qty: 3, checkoutAt: diaNoBrasil(-10) });
    const primeira = await devolver(saida.body.unidades[0].id, { qty: 1, checkinAt: diaNoBrasil(-5) });
    const segunda = await devolver(saida.body.unidades[0].id, { qty: 1, checkinAt: diaNoBrasil(-5) });
    expect([primeira.status, segunda.status]).toEqual([200, 200]);
    expect(segunda.body.returnedAt).toBe(primeira.body.returnedAt);

    const { body } = await api.get<{ total: number; rows: Evento[] }>(`/api/stock/items/${cabo.id}/history`);
    expect(body.total).toBe(3);
    expect(body.rows.map((e) => [e.action, e.unidades])).toEqual([['CHECKIN', 1], ['CHECKIN', 1], ['CHECKOUT', 3]]);
    expect(new Set(body.rows.map((e) => e.id)).size).toBe(3);

    type Historico = { rows: { id: string; fonte: string; action: string; estoque: { unidades: number } | null }[] };
    const daPessoa = (await api.get<Historico>(`/api/people/${pessoa}/history`)).body.rows.filter((e) => e.fonte === 'ESTOQUE');
    expect(daPessoa.map((e) => [e.action, e.estoque?.unidades])).toEqual([['CHECKIN', 1], ['CHECKIN', 1], ['CHECKOUT', 3]]);
    expect(new Set(daPessoa.map((e) => e.id)).size).toBe(3);
  });

  it('cadastro, edição do total e desativação não aparecem: só entregas e devoluções', async () => {
    const toner = await item('Toner sem movimento', 2);
    expect((await api.put(`/api/stock/items/${toner.id}`, { qty: 5 })).status).toBe(200);
    expect((await api.put(`/api/stock/items/${toner.id}`, { isActive: false })).status).toBe(200);

    const { body } = await api.get<{ total: number; rows: Evento[] }>(`/api/stock/items/${toner.id}/history`);
    expect(body).toEqual({ total: 0, rows: [] });
  });

  it('15 por página, nenhum evento some nem se repete — e não tem busca', async () => {
    const pilha = await item('Pilha das páginas', 20);
    for (let i = 0; i < 9; i += 1) {
      const saida = await entregar(pilha.id, { targetType: 'PERSON', targetPersonId: cenario.ana });
      expect((await devolver(saida.body.unidades[0].id)).status).toBe(200);
    }

    const primeira = await api.get<{ total: number; rows: Evento[] }>(`/api/stock/items/${pilha.id}/history`);
    const segunda = await api.get<{ rows: Evento[] }>(`/api/stock/items/${pilha.id}/history?page=2`);
    expect(primeira.body.total).toBe(18);
    expect(primeira.body.rows).toHaveLength(15);
    expect(segunda.body.rows).toHaveLength(3);
    expect(new Set([...primeira.body.rows, ...segunda.body.rows].map((e) => e.id)).size).toBe(18);
    // O mais recente primeiro: a última devolução.
    expect(primeira.body.rows[0].action).toBe('CHECKIN');

    expect((await api.get(`/api/stock/items/${pilha.id}/history?q=ana`)).status).toBe(422);
  });
});

describe('o dia da entrega e da devolução', () => {
  it('a entrega aceita um dia passado; futura é 422', async () => {
    const mouse = await item('Mouse da entrega antiga', 3);
    const antiga = await entregar(mouse.id, { targetType: 'PERSON', targetPersonId: cenario.laura, checkoutAt: diaNoBrasil(-10) });
    expect(antiga.status).toBe(201);
    // Meio-dia de Brasília: lido no fuso de quem usa, continua sendo aquele dia.
    expect(antiga.body.unidades[0].checkoutAt).toBe(`${diaNoBrasil(-10)}T15:00:00.000Z`);

    const futura = await entregar(mouse.id, { targetType: 'PERSON', targetPersonId: cenario.laura, checkoutAt: diaNoBrasil(1) });
    expect(futura.status).toBe(422);
    expect(futura.body.error).toContain('não pode ser uma data futura');
  });

  it('a devolução aceita um dia passado, mas nunca futuro nem antes da entrega', async () => {
    const teclado = await item('Teclado da devolução antiga', 1);
    const saida = await entregar(teclado.id, { targetType: 'PERSON', targetPersonId: cenario.laura, checkoutAt: diaNoBrasil(-10) });
    const unidade = saida.body.unidades[0].id;

    expect((await devolver(unidade, { checkinAt: diaNoBrasil(1) })).status).toBe(422);
    const antes = await devolver(unidade, { checkinAt: diaNoBrasil(-11) });
    expect(antes.status).toBe(422);
    expect(antes.body.error).toMatch(/^A devolução \(.+\) não pode ser antes da entrega \(.+\)\.$/);

    const passada = await devolver(unidade, { checkinAt: diaNoBrasil(-3) });
    expect(passada.status).toBe(200);
    expect(passada.body.returnedAt).toBe(`${diaNoBrasil(-3)}T15:00:00.000Z`);
  });

  it('a devolução não aceita observação nem campo desconhecido', async () => {
    const cabo = await item('Cabo da devolução com nota', 1);
    const saida = await entregar(cabo.id, { targetType: 'PERSON', targetPersonId: cenario.ana });
    expect((await devolver(saida.body.unidades[0].id, { notes: 'voltou' })).status).toBe(422);
  });
});

describe('as fichas', () => {
  it('a do posto lista o estoque da mesa por saída, e não conta como ativo', async () => {
    const mesa = await criarPosto(api, { name: 'Mesa com estoque' });
    const mouse = await item('Mouse da ficha do posto', 5);
    const saida = await entregar(mouse.id, { targetType: 'WORKSTATION', targetWorkstationId: mesa, qty: 3 });

    type Ficha = { itens: { id: string; unidades: number; item: { id: string; name: string; isActive: boolean } }[]; totalAtivos: number };
    const antes = await api.get<Ficha>(`/api/workstations/${mesa}`);
    expect(antes.body.itens.map((s) => [s.item.name, s.unidades])).toEqual([['Mouse da ficha do posto', 3]]);
    expect(antes.body.itens[0].item).toMatchObject({ id: mouse.id, isActive: true });
    // Estoque NÃO conta como ativo: `totalAtivos` é o número que a invariante
    // 19 limita a um, e um mouse não entra nele.
    expect(antes.body.totalAtivos).toBe(0);

    expect((await devolver(saida.body.unidades[0].id, { qty: 2 })).status).toBe(200);
    expect((await api.get<Ficha>(`/api/workstations/${mesa}`)).body.itens.map((s) => s.unidades)).toEqual([1]);
  });

  it('a da pessoa lista o estoque no nome dela, e o item desativado continua lá', async () => {
    const pessoa = await criarColaborador(api, { name: 'Bia da Ficha', email: 'bia.ficha@teste.local' });
    const fone = await item('Fone da ficha da pessoa', 2);
    expect((await entregar(fone.id, { targetType: 'PERSON', targetPersonId: pessoa, qty: 2 })).status).toBe(201);
    expect((await api.put(`/api/stock/items/${fone.id}`, { isActive: false })).status).toBe(200);

    type Ficha = { itens: { unidades: number; item: { name: string; isActive: boolean } }[] };
    const ficha = await api.get<Ficha>(`/api/people/${pessoa}`);
    expect(ficha.body.itens).toEqual([expect.objectContaining({ unidades: 2, item: expect.objectContaining({ isActive: false }) })]);
  });

  it('o histórico da pessoa traz o estoque no nome dela, por saída', async () => {
    const pessoa = await criarColaborador(api, { name: 'Caio do Histórico', email: 'caio.historico@teste.local' });
    const hub = await item('Hub do histórico da pessoa', 3);
    const saida = await entregar(hub.id, { targetType: 'PERSON', targetPersonId: pessoa, qty: 2, checkoutAt: diaNoBrasil(-4) });
    expect((await devolver(saida.body.unidades[0].id, { qty: 1 })).status).toBe(200);
    // O que vai para a MESA dele não é dele.
    expect((await entregar(hub.id, { targetType: 'WORKSTATION', targetWorkstationId: cenario.mesa1 })).status).toBe(201);

    type Historico = { rows: { fonte: string; action: string; estoque: { itemLabel: string; unidades: number } | null }[] };
    const { body } = await api.get<Historico>(`/api/people/${pessoa}/history`);
    const doEstoque = body.rows.filter((e) => e.fonte === 'ESTOQUE');
    expect(doEstoque.map((e) => [e.action, e.estoque?.unidades])).toEqual([['CHECKIN', 1], ['CHECKOUT', 2]]);
    expect(doEstoque[0].estoque?.itemLabel).toBe('Hub do histórico da pessoa');
  });
});
