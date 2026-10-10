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
