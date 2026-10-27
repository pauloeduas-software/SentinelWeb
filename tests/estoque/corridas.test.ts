import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../server/core/database/prismaClient';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import { cenarioDePosse, criarItemDeEstoque, criarPosto } from '../helpers/fixtures';

// AS CORRIDAS DO ESTOQUE — o que "passa no teste com um usuário".
//
// O saldo é `COUNT` das saídas abertas, e contar não é travar: duas requisições
// podem contar "4 de 5 em uso" e as duas inserirem, dando 6 de 5. Quem fecha
// isso é o `FOR UPDATE` na linha do item, dentro da transação — e este arquivo é
// a prova de que ele trava. A asserção nunca é "deu certo": é "exatamente N
// passaram, e o banco tem exatamente N linhas".

let api: ApiDeTeste;
let cenario: Awaited<ReturnType<typeof cenarioDePosse>>;

beforeAll(async () => {
  api = await criarApi();
  cenario = await cenarioDePosse(api);
});

afterAll(async () => {
  await api.fechar();
});

function placar(respostas: { status: number }[]): Record<number, number> {
  const contagem: Record<number, number> = {};
  for (const r of respostas) contagem[r.status] = (contagem[r.status] ?? 0) + 1;
  return contagem;
}

const entregar = (itemId: string, qty = 1) =>
  api.post<{ unidades: { id: string }[] }>(`/api/stock/items/${itemId}/checkout`, {
    targetType: 'PERSON', targetPersonId: cenario.laura, qty,
  });

const abertas = (itemId: string) =>
  prisma.stockMovement.count({ where: { itemId, returnedAt: null } });

describe('duas entregas simultâneas de um item com UMA unidade', () => {
  it('deixa passar exatamente UMA', async () => {
    const mouse = await criarItemDeEstoque(api, { name: 'Mouse da corrida', categoryId: cenario.categoriaEstoqueId, qty: 1 });

    // SEM `await` entre as duas: é o `Promise.all` que as põe no event loop
    // juntas, cada uma com sua conexão do pool. Quem serializa é o Postgres.
    const respostas = await Promise.all([entregar(mouse.id), entregar(mouse.id)]);

    expect(placar(respostas)).toEqual({ 201: 1, 409: 1 });
    expect(await abertas(mouse.id)).toBe(1);
  });
});

describe('cinco entregas simultâneas de um estoque de três', () => {
  it('deixa passar exatamente TRÊS', async () => {
    const cabo = await criarItemDeEstoque(api, { name: 'Cabo da corrida', categoryId: cenario.categoriaEstoqueId, qty: 3 });

    const respostas = await Promise.all(Array.from({ length: 5 }, () => entregar(cabo.id)));

    expect(placar(respostas)).toEqual({ 201: 3, 409: 2 });
    expect(await abertas(cabo.id)).toBe(3);
  });
});

describe('reduzir o total ao mesmo tempo que uma entrega, no item de DUAS unidades', () => {
  it('nunca termina com mais unidades em uso do que o total', async () => {
    // As duas travam a MESMA linha do item antes de contar, então o Postgres
    // serializa: a redução para 1 com uma unidade fora passa, e a entrega que
    // vem depois vê "1 no total, 1 em uso"; ou a entrega passa primeiro, e a
    // redução vê 2 em uso. O que não pode é as DUAS passarem.
    const dock = await criarItemDeEstoque(api, { name: 'Dock da corrida total×entrega', categoryId: cenario.categoriaEstoqueId, qty: 2 });
    expect((await entregar(dock.id)).status).toBe(201);

    const [reducao, entrega] = await Promise.all([api.put(`/api/stock/items/${dock.id}`, { qty: 1 }), entregar(dock.id)]);

    expect([reducao.status === 200, entrega.status === 201].filter(Boolean)).toHaveLength(1);
    const item = await prisma.stockItem.findUniqueOrThrow({ where: { id: dock.id }, select: { qty: true } });
    expect(await abertas(dock.id)).toBeLessThanOrEqual(item.qty);
  });
});

describe('devolver a mesma saída duas vezes ao mesmo tempo', () => {
  it('fecha UMA vez — e o carimbo de devolução não é reescrito', async () => {
    const teclado = await criarItemDeEstoque(api, { name: 'Teclado devolvido duas vezes', categoryId: cenario.categoriaEstoqueId, qty: 2 });
    const saida = await entregar(teclado.id, 2);
    const unidade = saida.body.unidades[0].id;

    const devolver = () => api.post<{ returnedAt: string }>(`/api/stock/checkouts/${unidade}/checkin`, {});
    const respostas = await Promise.all([devolver(), devolver()]);

    // A segunda espera nas linhas travadas, relê, e não encontra nenhuma aberta.
    expect(placar(respostas)).toEqual({ 200: 1, 409: 1 });

    const vencedora = respostas.find((r) => r.status === 200)!;
    const linhas = await prisma.stockMovement.findMany({ where: { itemId: teclado.id }, select: { returnedAt: true } });
    expect(linhas.map((l) => l.returnedAt?.toISOString())).toEqual([vencedora.body.returnedAt, vencedora.body.returnedAt]);
  });

  it('duas devoluções parciais que cabem passam as duas — sem 409 falso', async () => {
    const fone = await criarItemDeEstoque(api, { name: 'Fone das devoluções parciais', categoryId: cenario.categoriaEstoqueId, qty: 4 });
    const saida = await entregar(fone.id, 4);
    const unidade = saida.body.unidades[0].id;

    const devolver = () => api.post(`/api/stock/checkouts/${unidade}/checkin`, { qty: 2 });
    const respostas = await Promise.all([devolver(), devolver()]);

    expect(placar(respostas)).toEqual({ 200: 2 });
    expect(await abertas(fone.id)).toBe(0);
  });
});

describe('troca do tipo da categoria STOCK → ASSET × cadastro de item nela', () => {
  it('nunca termina com item de estoque numa categoria que não é de estoque', async () => {
    // A FK só quer que a categoria EXISTA: o cadastro lia "Monitor → STOCK",
    // a troca contava zero itens e gravava ASSET, e o item confirmava depois.
    // Quem fecha é a trava nos dois lados (`catalog-lock.helper.ts`). Várias
    // rodadas porque a ordem de chegada varia.
    for (let rodada = 0; rodada < 8; rodada += 1) {
      const criada = await api.post<{ id: string }>('/api/categories', { name: `Família da corrida ${rodada}`, type: 'STOCK' });
      expect(criada.status).toBe(201);
      const categoryId = criada.body.id;

      const [troca, cadastro] = await Promise.all([
        api.put(`/api/categories/${categoryId}`, { type: 'ASSET' }),
        api.post('/api/stock/items', { name: `Item da corrida ${rodada}`, categoryId, qty: 1 }),
      ]);

      // Exatamente uma vence: ou o item entra e a troca vê 1 uso (409), ou a
      // troca passa e o cadastro vê ASSET (422).
      const venceu = [troca.status === 200, cadastro.status === 201].filter(Boolean).length;
      expect(venceu, `troca ${troca.status}, cadastro ${cadastro.status}`).toBe(1);

      const [categoria, itens] = await Promise.all([
        prisma.category.findUniqueOrThrow({ where: { id: categoryId }, select: { type: true } }),
        prisma.stockItem.count({ where: { categoryId } }),
      ]);
      if (itens > 0) expect(categoria.type).toBe('STOCK');
    }
  });
});

describe('excluir o item ao mesmo tempo que ele é entregue', () => {
  it('ou a entrega passa e a exclusão vira 409, ou a exclusão passa e a entrega vira 404', async () => {
    const hub = await criarItemDeEstoque(api, { name: 'Hub da exclusão disputada', categoryId: cenario.categoriaEstoqueId, qty: 1 });

    const [exclusao, entrega] = await Promise.all([api.delete(`/api/stock/items/${hub.id}`), entregar(hub.id)]);

    expect([exclusao.status, entrega.status].sort()).toEqual(exclusao.status === 204 ? [204, 404] : [201, 409]);
  });
});

// O deadlock que a trava na ordem do id evita não se reproduz aqui: numa tabela
// pequena o Postgres lê as linhas na ordem física pelos dois caminhos. Ele
// aparece com a tabela grande, quando cada exclusão lê por um índice diferente
// (`itemId, checkoutAt` × `targetWorkstationId, returnedAt`). Este teste prova o
// resultado das duas juntas, não a ordem.
describe('excluir o item e o posto ao mesmo tempo, com saídas devolvidas em comum', () => {
  it('os dois passam, e as saídas ficam com os dois nomes por escrito', async () => {
    for (let rodada = 0; rodada < 5; rodada++) {
      const nome = `Cabo da rodada ${rodada}`;
      const posto = await criarPosto(api, { name: `Bancada da rodada ${rodada}` });
      const cabo = await criarItemDeEstoque(api, { name: nome, categoryId: cenario.categoriaEstoqueId, qty: 6 });
      const saida = await api.post<{ unidades: { id: string }[] }>(`/api/stock/items/${cabo.id}/checkout`, {
        targetType: 'WORKSTATION', targetWorkstationId: posto, qty: 6,
      });
      expect(saida.status).toBe(201);
      expect((await api.post(`/api/stock/checkouts/${saida.body.unidades[0].id}/checkin`, {})).status).toBe(200);

      const respostas = await Promise.all([api.delete(`/api/stock/items/${cabo.id}`), api.delete(`/api/workstations/${posto}`)]);
      expect(respostas.map((r) => r.status)).toEqual([204, 200]);

      const linhas = await prisma.stockMovement.findMany({ where: { id: { in: saida.body.unidades.map((u) => u.id) } } });
      expect(linhas).toHaveLength(6);
      for (const linha of linhas) {
        expect([linha.itemId, linha.itemName, linha.targetWorkstationId, linha.targetWorkstationName])
          .toEqual([null, nome, null, `Bancada da rodada ${rodada}`]);
      }
    }
  });
});
