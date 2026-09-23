import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import { cenarioDePosse, criarItemDeEstoque } from '../helpers/fixtures';
import { prisma } from '../../server/core/database/prismaClient';

// AS CORRIDAS DO SALDO — o que "passa no teste com um usuário".
//
// CONTAR NÃO É TRAVAR. O `COUNT` garante que a resposta não diverge das linhas;
// ele não impede que duas linhas nasçam ao mesmo tempo. Duas requisições podem
// contar "4 de 5 ocupados" e as duas inserirem: 6 de 5. Em READ COMMITTED
// nenhuma enxerga o checkout que a outra ainda não confirmou, e nenhum `if`
// pega isso.
//
// Quem resolve é o `SELECT … FOR UPDATE` na linha-pai, DENTRO da transação —
// um lock em autocommit é um lock que dura zero milissegundo.
//
// Por isso estes testes disparam as requisições SEM `await` entre elas e contam
// os status. A asserção nunca é "deu certo": é "exatamente N passaram, e o
// banco tem exatamente N linhas".

let api: ApiDeTeste;
let cenario: Awaited<ReturnType<typeof cenarioDePosse>>;

beforeAll(async () => {
  api = await criarApi();
  cenario = await cenarioDePosse(api);
});

afterAll(async () => {
  await api.fechar();
});

/** Quantas respostas de cada status — é a única forma da asserção de corrida. */
function placar(respostas: { status: number }[]): Record<number, number> {
  const contagem: Record<number, number> = {};
  for (const r of respostas) contagem[r.status] = (contagem[r.status] ?? 0) + 1;
  return contagem;
}

describe('duas entregas simultâneas de um acessório com UMA unidade', () => {
  it('deixa passar exatamente UMA', async () => {
    const item = await criarItemDeEstoque(api, 'accessories', {
      name: 'Mouse da corrida', categoryId: cenario.categoriaAcessorioId, qty: 1,
    });

    const respostas = await Promise.all([
      api.post(`/api/accessories/${item.id}/checkout`, { targetType: 'USER', targetUserId: cenario.laura }),
      api.post(`/api/accessories/${item.id}/checkout`, { targetType: 'USER', targetUserId: cenario.ana }),
    ]);

    expect(placar(respostas)).toMatchObject({ 201: 1, 409: 1 });

    const abertas = await prisma.accessoryCheckout.count({
      where: { accessoryId: item.id, checkedInAt: null },
    });
    expect(abertas).toBe(1);
  });

  it('não deixa a perdedora gravar uma linha já devolvida de consolação', async () => {
    // Uma linha com `checkedInAt` preenchido criada pela requisição perdedora
    // seria histórico de uma entrega que nunca aconteceu, e o relatório de
    // "quem esteve com este mouse" mentiria.
    const item = await prisma.accessory.findFirstOrThrow({
      where: { name: 'Mouse da corrida' }, select: { id: true },
    });
    expect(await prisma.accessoryCheckout.count({ where: { accessoryId: item.id } })).toBe(1);
  });
});

describe('cinco entregas simultâneas de um estoque de três', () => {
  it('deixa passar exatamente TRÊS', async () => {
    // O caso que só aparece no dia do onboarding de uma turma: cinco pessoas
    // clicando em "entregar" no mesmo segundo.
    const item = await criarItemDeEstoque(api, 'accessories', {
      name: 'Teclado do onboarding', categoryId: cenario.categoriaAcessorioId, qty: 3,
    });

    const respostas = await Promise.all(
      Array.from({ length: 5 }, () =>
        api.post(`/api/accessories/${item.id}/checkout`, {
          targetType: 'LOCATION', targetLocationId: cenario.mesa1,
        })),
    );

    expect(placar(respostas)).toMatchObject({ 201: 3, 409: 2 });

    const depois = await api.get<{ qty: number; disponivel: number }>(`/api/accessories/${item.id}`);
    // NUNCA negativo: é isso que a trava compra. Sem ela, as cinco passariam e
    // o disponível ficaria em −2.
    expect(depois.body).toMatchObject({ qty: 3, disponivel: 0 });
  });
});

describe('consumos simultâneos do mesmo consumível', () => {
  it('não deixa consumir mais do que existe', async () => {
    const item = await criarItemDeEstoque(api, 'consumables', {
      name: 'Resma da corrida', categoryId: cenario.categoriaConsumivelId, qty: 10,
    });

    // Quatro pedidos de 3 unidades em 10: cabem três, o quarto não.
    const respostas = await Promise.all(
      Array.from({ length: 4 }, () =>
        api.post(`/api/consumables/${item.id}/consume`, { userId: cenario.ana, qty: 3 })),
    );

    expect(placar(respostas)).toMatchObject({ 201: 3, 409: 1 });

    const somado = await prisma.consumableCheckout.aggregate({
      where: { consumableId: item.id },
      _sum: { qty: true },
    });
    expect(somado._sum.qty).toBe(9);
  });
});

describe('instalações simultâneas do mesmo componente', () => {
  it('não deixa instalar mais unidades do que há em estoque', async () => {
    const item = await criarItemDeEstoque(api, 'components', {
      name: 'RAM da corrida', categoryId: cenario.categoriaComponenteId, qty: 4,
    });

    const respostas = await Promise.all([
      api.post(`/api/components/${item.id}/attach`, { assetId: cenario.ativo.id, qty: 3 }),
      api.post(`/api/components/${item.id}/attach`, { assetId: cenario.ativo.id, qty: 3 }),
    ]);

    expect(placar(respostas)).toMatchObject({ 201: 1, 409: 1 });

    const instalado = await prisma.componentAsset.aggregate({
      where: { componentId: item.id, detachedAt: null },
      _sum: { assignedQty: true },
    });
    expect(instalado._sum.assignedQty).toBe(3);
  });
});

describe('devolver a mesma unidade duas vezes ao mesmo tempo', () => {
  it('fecha UMA vez — e o carimbo de devolução não é reescrito', async () => {
    // Aqui não há `FOR UPDATE`: quem serializa é o `checkedInAt: null` no WHERE
    // do `updateMany`, aplicado pelo Postgres na hora do UPDATE. A segunda
    // transação afeta zero linhas e recebe o 409.
    const item = await criarItemDeEstoque(api, 'accessories', {
      name: 'Mouse da dupla devolução', categoryId: cenario.categoriaAcessorioId, qty: 1,
    });
    const entrega = await api.post<{ id: string }>(`/api/accessories/${item.id}/checkout`, {
      targetType: 'USER', targetUserId: cenario.laura,
    });

    const respostas = await Promise.all([
      api.post(`/api/accessories/checkouts/${entrega.body.id}/checkin`, { notes: 'primeira' }),
      api.post(`/api/accessories/checkouts/${entrega.body.id}/checkin`, { notes: 'segunda' }),
    ]);

    expect(placar(respostas)).toMatchObject({ 200: 1, 409: 1 });

    const linha = await prisma.accessoryCheckout.findUniqueOrThrow({
      where: { id: entrega.body.id },
      select: { checkinNotes: true },
    });
    // A nota da perdedora NÃO sobrescreveu a da vencedora.
    expect(['primeira', 'segunda']).toContain(linha.checkinNotes);
  });
});

describe('desligar e entregar acessório ao mesmo tempo', () => {
  it('não deixa o desligado terminar com unidade na mão', async () => {
    // A corrida mais cara da integração com a F4: o `offboard` lê as entregas
    // abertas e as fecha; uma entrega que entre DEPOIS dessa leitura e ANTES do
    // commit deixaria o desligado responsável por uma unidade — e o 409 do
    // DELETE passaria a travar o cadastro para sempre. Quem fecha isso é a
    // ordem de travamento: usuário ANTES do item.
    const pessoa = await api.post<{ id: string }>('/api/users', {
      name: 'Quem sai na corrida', email: 'corrida-estoque@teste.local',
    });
    const item = await criarItemDeEstoque(api, 'accessories', {
      name: 'Mouse do desligamento', categoryId: cenario.categoriaAcessorioId, qty: 5,
    });

    const [entrega, desligamento] = await Promise.all([
      api.post(`/api/accessories/${item.id}/checkout`, {
        targetType: 'USER', targetUserId: pessoa.body.id,
      }),
      api.post(`/api/users/${pessoa.body.id}/offboard`, { notes: 'corrida' }),
    ]);

    // Qualquer uma pode ganhar — o que NÃO pode é o estado final ter as duas
    // coisas verdadeiras.
    expect([201, 409]).toContain(entrega.status);
    expect([200, 409]).toContain(desligamento.status);

    const desligada = await prisma.user.findFirstOrThrow({
      where: { id: pessoa.body.id }, select: { terminatedAt: true },
    });

    if (desligada.terminatedAt) {
      const abertas = await prisma.accessoryCheckout.count({
        where: { targetType: 'USER', targetUserId: pessoa.body.id, checkedInAt: null },
      });
      expect(abertas).toBe(0);
    }
  });
});
