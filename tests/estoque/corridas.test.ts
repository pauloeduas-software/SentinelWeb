import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../server/core/database/prismaClient';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import { cenarioDePosse, criarItemDeEstoque } from '../helpers/fixtures';

// AS CORRIDAS DO ESTOQUE — o que "passa no teste com um usuário".
//
// O saldo é `COUNT` das saídas abertas, e contar não é travar: duas requisições
// podem contar "4 de 5 fora" e as duas inserirem, dando 6 de 5. Quem fecha isso
// é o `FOR UPDATE` na linha do item, dentro da transação — e este arquivo é a
// prova de que ele trava. A asserção nunca é "deu certo": é "exatamente N
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

const sair = (itemId: string) =>
  api.post<{ unidades: { id: string }[] }>(`/api/stock/items/${itemId}/checkout`, {
    targetType: 'USER', targetUserId: cenario.laura,
  });

const abertas = (itemId: string) =>
  prisma.stockMovement.count({ where: { itemId, kind: 'SAIDA', returnedAt: null } });

describe('duas saídas simultâneas de um item com UMA unidade', () => {
  it('deixa passar exatamente UMA', async () => {
    const mouse = await criarItemDeEstoque(api, { name: 'Mouse da corrida', categoryId: cenario.categoriaEstoqueId, qty: 1 });

    // SEM `await` entre as duas: é o `Promise.all` que as põe no event loop
    // juntas, cada uma com sua conexão do pool. Quem serializa é o Postgres.
    const respostas = await Promise.all([sair(mouse.id), sair(mouse.id)]);

    expect(placar(respostas)[201]).toBe(1);
    expect(placar(respostas)[409]).toBe(1);
    expect(await abertas(mouse.id)).toBe(1);
  });
});

describe('cinco saídas simultâneas de um estoque de três', () => {
  it('deixa passar exatamente TRÊS', async () => {
    const cabo = await criarItemDeEstoque(api, { name: 'Cabo da corrida', categoryId: cenario.categoriaEstoqueId, qty: 3 });

    const respostas = await Promise.all(Array.from({ length: 5 }, () => sair(cabo.id)));

    expect(placar(respostas)[201]).toBe(3);
    expect(placar(respostas)[409]).toBe(2);
    expect(await abertas(cabo.id)).toBe(3);
  });
});

describe('BAIXA concorrente com SAÍDA, no mesmo item de UMA unidade', () => {
  it('deixa passar exatamente UMA, e o estado final bate com quem venceu', async () => {
    // As duas travam a MESMA linha do item antes de contar (`travarItemOuFalhar`
    // em `adjust-stock` e em `checkout-stock`), então o Postgres serializa: uma
    // das duas vê o estado DEPOIS da outra. Não importa qual vence — a baixa de
    // 1 com a unidade já fora, ou a saída de um item já baixado a zero — o que
    // não pode acontecer é as DUAS passarem.
    const dock = await criarItemDeEstoque(api, { name: 'Dock da corrida baixa×saída', categoryId: cenario.categoriaEstoqueId, qty: 1 });

    const baixar = () => api.post(`/api/stock/items/${dock.id}/adjust`, { kind: 'BAIXA', qty: 1 });
    const [baixa, saida] = await Promise.all([baixar(), sair(dock.id)]);

    const sucessos = [baixa.status === 201, saida.status === 201].filter(Boolean).length;
    expect(sucessos).toBe(1);
    expect([baixa.status, saida.status].filter((s) => s !== 201)).toEqual([409]);

    const item = await prisma.stockItem.findUniqueOrThrow({ where: { id: dock.id }, select: { qty: true } });
    const fora = await abertas(dock.id);
    if (baixa.status === 201) {
      // A baixa venceu: o item foi a zero antes de a saída contar, e ela viu
      // "0 de 0 fora" — sem unidade.
      expect(item.qty).toBe(0);
      expect(fora).toBe(0);
    } else {
      // A saída venceu: a unidade saiu, e a baixa viu "1 de 1 fora" — abaixo
      // do que está fora.
      expect(item.qty).toBe(1);
      expect(fora).toBe(1);
    }
  });
});

describe('devolver a mesma unidade duas vezes ao mesmo tempo', () => {
  it('fecha UMA vez — e o carimbo de devolução não é reescrito', async () => {
    const teclado = await criarItemDeEstoque(api, { name: 'Teclado devolvido duas vezes', categoryId: cenario.categoriaEstoqueId, qty: 1 });
    const saida = await sair(teclado.id);
    const unidade = saida.body.unidades[0].id;

    const devolver = () => api.post<{ returnedAt: string }>(`/api/stock/movements/${unidade}/checkin`, {});
    const respostas = await Promise.all([devolver(), devolver()]);

    // Sem lock e sem janela: o `updateMany` com `returnedAt: null` no WHERE
    // afeta zero linhas na segunda transação, e ela recebe o 409.
    expect(placar(respostas)[200]).toBe(1);
    expect(placar(respostas)[409]).toBe(1);

    const vencedora = respostas.find((r) => r.status === 200)!;
    const linha = await prisma.stockMovement.findUniqueOrThrow({ where: { id: unidade }, select: { returnedAt: true } });
    expect(linha.returnedAt?.toISOString()).toBe(vencedora.body.returnedAt);
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
