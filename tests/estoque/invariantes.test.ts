import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../server/core/database/prismaClient';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import { cenarioDePosse, criarColaborador, criarItemDeEstoque, criarLocal } from '../helpers/fixtures';

// AS INVARIANTES DO ESTOQUE — o saldo calculado, a forma do movimento, a
// quantidade que não é campo, a categoria do tipo certo, a lixeira protegida e
// a ponta nova da invariante 6.
//
// Ativo é computador; o que não é máquina é estoque, por quantidade. Uma linha
// de `stock_items` é o item, cada unidade que sai é uma linha de SAIDA em
// `stock_movements`, e o disponível é `qty − COUNT(saídas abertas)` — nunca
// coluna. Se um teste daqui ficar vermelho, o almoxarifado já pode estar
// mentindo no banco.

let api: ApiDeTeste;
let cenario: Awaited<ReturnType<typeof cenarioDePosse>>;

beforeAll(async () => {
  api = await criarApi();
  cenario = await cenarioDePosse(api);
});

afterAll(async () => {
  await api.fechar();
});

async function item(name: string, qty = 1) {
  return criarItemDeEstoque(api, { name, categoryId: cenario.categoriaEstoqueId, qty });
}

interface Saida {
  error: string;
  unidades: { id: string; qty: number; returnedAt: string | null }[];
  disponivel: number;
  fora?: number;
  qty?: number;
}

const sair = (itemId: string, corpo: Record<string, unknown>) =>
  api.post<Saida>(`/api/stock/items/${itemId}/checkout`, corpo);

const paraLaura = (itemId: string, qty = 1) =>
  sair(itemId, { targetType: 'USER', targetUserId: cenario.laura, qty });

const lerItem = (itemId: string) =>
  api.get<{ qty: number; fora: number; disponivel: number; unidadesFora: { id: string }[] }>(`/api/stock/items/${itemId}`);

describe('o saldo é calculado, nunca coluna', () => {
  it('não existe coluna de disponível em stock_items', async () => {
    // A asserção que pega o atalho: uma coluna `disponivel` mantida por
    // decremento pode DIVERGIR das linhas — basta um INSERT que não passe pelo
    // decremento — e a partir daí ela mente para sempre.
    const colunas = await prisma.$queryRaw<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns WHERE table_name = 'stock_items'
    `;
    const nomes = colunas.map((c) => c.column_name);
    expect(nomes).toContain('qty');
    expect(nomes).not.toContain('disponivel');
    expect(nomes).not.toContain('qtyAvailable');
  });

  it('o disponível cai com a saída e volta com a devolução', async () => {
    const mouse = await item('Mouse do saldo', 3);

    const saida = await paraLaura(mouse.id, 2);
    expect(saida.status).toBe(201);
    expect(saida.body.disponivel).toBe(1);

    const depoisDaSaida = await lerItem(mouse.id);
    expect(depoisDaSaida.body).toMatchObject({ qty: 3, fora: 2, disponivel: 1 });
    expect(depoisDaSaida.body.unidadesFora).toHaveLength(2);

    const devolucao = await api.post(`/api/stock/movements/${saida.body.unidades[0].id}/checkin`, {});
    expect(devolucao.status).toBe(200);

    expect((await lerItem(mouse.id)).body).toMatchObject({ qty: 3, fora: 1, disponivel: 2 });
  });

  it('recusa a saída quando não há unidade, com 409 e os números', async () => {
    const teclado = await item('Teclado único', 1);
    expect((await paraLaura(teclado.id)).status).toBe(201);

    const { status, body } = await paraLaura(teclado.id);
    expect(status).toBe(409);
    expect(body.error).toMatch(/sem unidade dispon[íi]vel/i);
    // Os números vão no corpo para a tela não ter que recontar.
    expect(body).toMatchObject({ qty: 1, fora: 1, disponivel: 0 });
  });

  it('a saída de n unidades grava n linhas de 1, e pede n de uma vez', async () => {
    const cabo = await item('Cabo em lote', 5);

    const { status, body } = await paraLaura(cabo.id, 3);
    expect(status).toBe(201);
    expect(body.unidades).toHaveLength(3);
    expect(body.unidades.every((u) => u.qty === 1 && u.returnedAt === null)).toBe(true);

    // A saída de 3 com 2 disponíveis é recusada INTEIRA: não sai "o que der".
    const demais = await paraLaura(cabo.id, 3);
    expect(demais.status).toBe(409);
    expect(await prisma.stockMovement.count({ where: { itemId: cabo.id, kind: 'SAIDA' } })).toBe(3);
  });
});

describe('a entrega ao posto não multiplica por ocupante', () => {
  it('desconta UMA unidade, com duas pessoas na mesa', async () => {
    // Laura e Ana ocupam a Mesa 1. Entregar um mouse à mesa é UMA unidade fora,
    // qualquer que seja a escala: o saldo do almoxarifado não pode depender do
    // RH — a mesa ganharia uma terceira ocupante e, sem ninguém tocar numa
    // unidade física, o disponível cairia.
    for (const userId of [cenario.laura, cenario.ana]) {
      const ocupacao = await api.post(`/api/locations/${cenario.mesa1}/occupants`, { userId, shift: 'Manhã' });
      expect(ocupacao.status).toBe(201);
    }

    const mouse = await item('Mouse da mesa compartilhada', 2);
    const { status } = await sair(mouse.id, { targetType: 'LOCATION', targetLocationId: cenario.mesa1 });
    expect(status).toBe(201);

    expect((await lerItem(mouse.id)).body).toMatchObject({ fora: 1, disponivel: 1 });
  });

  it('aceita a entrega a um posto VAZIO: é a mesa preparada antes de a pessoa chegar', async () => {
    const vazio = await criarLocal(api, { name: 'Mesa vazia do estoque', isWorkstation: true });
    const headset = await item('Headset da mesa vazia', 1);

    const { status } = await sair(headset.id, { targetType: 'LOCATION', targetLocationId: vazio });
    expect(status).toBe(201);
  });
});

describe('o alvo da saída é UM — e quem garante é o banco', () => {
  it('recusa as duas FKs preenchidas, e nenhuma, com 422 do use-case', async () => {
    const dock = await item('Dock dos dois alvos', 2);

    const duas = await sair(dock.id, {
      targetType: 'USER', targetUserId: cenario.laura, targetLocationId: cenario.mesa1,
    });
    expect(duas.status).toBe(422);
    expect(duas.body.error).toMatch(/UM alvo/);

    const nenhuma = await sair(dock.id, { targetType: 'LOCATION' });
    expect(nenhuma.status).toBe(422);
  });

  it('o CHECK do Postgres recusa a linha incoerente mesmo por fora da API', async () => {
    // O CHECK existe justamente para quem NÃO passa pelo use-case: o psql à
    // mão, um script. Testar por HTTP seria impossível por construção.
    const dock = await item('Dock do CHECK', 1);
    const inserir = (colunas: Record<string, unknown>) => prisma.$executeRawUnsafe(
      `INSERT INTO stock_movements (id, "itemId", kind, qty, "targetType", "targetUserId", "targetLocationId", "returnedAt", "createdAt")
       VALUES (gen_random_uuid(), $1::uuid, $2::"StockMovementKind", $3::int, $4::"StockTarget", $5::uuid, $6::uuid, $7::timestamp, now())`,
      dock.id, colunas.kind, colunas.qty, colunas.targetType ?? null, colunas.targetUserId ?? null,
      colunas.targetLocationId ?? null, colunas.returnedAt ?? null,
    ).then(() => null, (erro: Error) => erro.message);

    // SAIDA com as duas FKs.
    expect(await inserir({ kind: 'SAIDA', qty: 1, targetType: 'USER', targetUserId: cenario.laura, targetLocationId: cenario.mesa1 }))
      .toMatch(/stock_movements_forma/);
    // SAIDA de duas unidades numa linha só: a unidade é UMA por linha.
    expect(await inserir({ kind: 'SAIDA', qty: 2, targetType: 'USER', targetUserId: cenario.laura }))
      .toMatch(/stock_movements_forma/);
    // ENTRADA com alvo: entrada não vai para ninguém.
    expect(await inserir({ kind: 'ENTRADA', qty: 1, targetType: 'USER', targetUserId: cenario.laura }))
      .toMatch(/stock_movements_forma/);
    // Movimento de zero.
    expect(await inserir({ kind: 'ENTRADA', qty: 0 })).toMatch(/stock_movements_qty_positiva/);
    // E a linha bem formada entra.
    expect(await inserir({ kind: 'SAIDA', qty: 1, targetType: 'LOCATION', targetLocationId: cenario.mesa1 })).toBeNull();
  });

  it('as três constraints existem no banco, e o índice parcial do nome também', async () => {
    // A asserção que pega o `db push`: as tabelas nascem certas e o SQL escrito
    // à mão some, porque `db push` não passa pelas migrations.
    const constraints = await prisma.$queryRaw<{ conname: string }[]>`
      SELECT conname FROM pg_constraint WHERE contype = 'c' AND conrelid = 'stock_movements'::regclass
    `;
    expect(constraints.map((c) => c.conname).sort()).toEqual([
      'stock_movements_devolucao_nao_antecede_saida',
      'stock_movements_forma',
      'stock_movements_qty_positiva',
    ]);

    const indices = await prisma.$queryRaw<{ indexname: string }[]>`
      SELECT indexname FROM pg_indexes WHERE tablename = 'stock_items'
    `;
    expect(indices.map((i) => i.indexname)).toContain('stock_items_name_unique_undeleted');
  });
});

describe('a quantidade não é campo do formulário', () => {
  it('PUT com qty responde 422 — pela chave ausente do schema, não por uma checagem', async () => {
    const toner = await item('Toner da edição', 4);
    const { status } = await api.put(`/api/stock/items/${toner.id}`, { qty: 99 });
    expect(status).toBe(422);
    expect((await lerItem(toner.id)).body.qty).toBe(4);
  });

  it('a ENTRADA soma ao total e grava o movimento; a BAIXA subtrai', async () => {
    const papel = await item('Resma da entrada', 2);

    const entrada = await api.post<{ item: { qty: number; disponivel: number }; movimento: { kind: string; qty: number } }>(
      `/api/stock/items/${papel.id}/adjust`, { kind: 'ENTRADA', qty: 3, notes: 'nota fiscal 123' },
    );
    expect(entrada.status).toBe(201);
    expect(entrada.body.item).toMatchObject({ qty: 5, disponivel: 5 });
    expect(entrada.body.movimento).toMatchObject({ kind: 'ENTRADA', qty: 3 });

    const baixa = await api.post<{ item: { qty: number } }>(`/api/stock/items/${papel.id}/adjust`, { kind: 'BAIXA', qty: 1 });
    expect(baixa.status).toBe(201);
    expect(baixa.body.item.qty).toBe(4);

    // O cadastro inicial é a primeira ENTRADA: a história começa do zero.
    const movimentos = await prisma.stockMovement.findMany({
      where: { itemId: papel.id }, orderBy: { createdAt: 'asc' }, select: { kind: true, qty: true },
    });
    expect(movimentos).toEqual([
      { kind: 'ENTRADA', qty: 2 }, { kind: 'ENTRADA', qty: 3 }, { kind: 'BAIXA', qty: 1 },
    ]);
  });

  it('recusa a BAIXA abaixo do que está fora', async () => {
    const fone = await item('Fone da baixa', 3);
    expect((await paraLaura(fone.id, 2)).status).toBe(201);

    // Dar baixa de 2 deixaria o total em 1 com 2 unidades na rua: a baixa diz
    // que sumiram unidades que estão com gente.
    const { status, body } = await api.post<{ error: string; fora: number }>(
      `/api/stock/items/${fone.id}/adjust`, { kind: 'BAIXA', qty: 2 },
    );
    expect(status).toBe(409);
    expect(body.error).toMatch(/abaixo do que está fora/i);
    expect(body.fora).toBe(2);
    expect((await lerItem(fone.id)).body.qty).toBe(3);

    // Baixa de 1 cabe: o total fica igual ao que está fora.
    expect((await api.post(`/api/stock/items/${fone.id}/adjust`, { kind: 'BAIXA', qty: 1 })).status).toBe(201);
  });

  it('uma quantidade de zero é recusada antes de virar linha', async () => {
    const zero = await item('Item do ajuste zero', 1);
    expect((await api.post(`/api/stock/items/${zero.id}/adjust`, { kind: 'ENTRADA', qty: 0 })).status).toBe(422);
    expect((await sair(zero.id, { targetType: 'USER', targetUserId: cenario.laura, qty: 0 })).status).toBe(422);
  });
});

describe('a categoria precisa ser de estoque', () => {
  it('recusa categoria de ATIVO com 422, e inexistente com 404', async () => {
    const deAtivo = await api.post<{ error: string }>('/api/stock/items', {
      name: 'Monitor na categoria errada', categoryId: cenario.categoriaId, qty: 1,
    });
    expect(deAtivo.status).toBe(422);
    expect(deAtivo.body.error).toMatch(/tipo Estoque/);

    const inexistente = await api.post('/api/stock/items', {
      name: 'Item sem categoria', categoryId: '00000000-0000-0000-0000-000000000000', qty: 1,
    });
    expect(inexistente.status).toBe(404);
  });

  it('e o catálogo não deixa a categoria em uso mudar de tipo', async () => {
    const categoria = await api.post<{ id: string }>('/api/categories', { name: 'Categoria presa ao estoque', type: 'STOCK' });
    expect(categoria.status).toBe(201);
    await criarItemDeEstoque(api, { name: 'Item que segura a categoria', categoryId: categoria.body.id, qty: 1 });

    const troca = await api.put<{ error: string }>(`/api/categories/${categoria.body.id}`, { type: 'ASSET' });
    expect(troca.status).toBe(409);
    expect(troca.body.error).toMatch(/1 registro/);
  });
});

describe('a lixeira é protegida por 409, e o nome fica livre nela', () => {
  it('recusa apagar item com unidade fora, e aceita depois da devolução', async () => {
    const webcam = await item('Webcam da lixeira', 1);
    const saida = await paraLaura(webcam.id);

    const recusa = await api.delete<{ error: string; fora: number }>(`/api/stock/items/${webcam.id}`);
    expect(recusa.status).toBe(409);
    expect(recusa.body.fora).toBe(1);

    expect((await api.post(`/api/stock/movements/${saida.body.unidades[0].id}/checkin`, {})).status).toBe(200);
    expect((await api.delete(`/api/stock/items/${webcam.id}`)).status).toBe(200);

    // Apagado some do detalhe e aparece na lixeira.
    expect((await lerItem(webcam.id)).status).toBe(404);
    const lixeira = await api.get<{ rows: { id: string }[] }>('/api/stock/items?view=trashed');
    expect(lixeira.body.rows.map((r) => r.id)).toContain(webcam.id);
  });

  it('o nome volta a ficar livre na lixeira, e a restauração recusa o nome tomado', async () => {
    const antigo = await item('Adaptador reaproveitado', 1);
    expect((await api.delete(`/api/stock/items/${antigo.id}`)).status).toBe(200);

    // O índice é parcial: o nome do item na lixeira não trava o recadastro.
    const novo = await api.post('/api/stock/items', { name: 'Adaptador reaproveitado', categoryId: cenario.categoriaEstoqueId, qty: 1 });
    expect(novo.status).toBe(201);

    // E restaurar o antigo esbarra no nome, com 409 e não com erro cru do banco.
    const restauracao = await api.post<{ error: string }>(`/api/stock/items/${antigo.id}/restore`);
    expect(restauracao.status).toBe(409);
    expect(restauracao.body.error).toMatch(/Adaptador reaproveitado/);
  });
});

describe('invariante 6 — a ponta do estoque', () => {
  it('pessoa com unidade no nome não vai para a lixeira, e o 409 diz quantas', async () => {
    const pessoa = await criarColaborador(api, { name: 'Pedro do Estoque', email: 'pedro.estoque@teste.local' });
    const mouse = await item('Mouse do Pedro', 1);
    expect((await sair(mouse.id, { targetType: 'USER', targetUserId: pessoa })).status).toBe(201);

    const { status, body } = await api.delete<{ error: string; itensEmPosse: number }>(`/api/users/${pessoa}`);
    expect(status).toBe(409);
    expect(body.error).toMatch(/1 item de estoque/);
    expect(body.itensEmPosse).toBe(1);

    // A ficha da pessoa conta a mesma ponta.
    const ficha = await api.get<{ posseAberta: { itensEmPosse: number } }>(`/api/users/${pessoa}`);
    expect(ficha.body.posseAberta.itensEmPosse).toBe(1);
  });

  it('a unidade do POSTO não conta para a pessoa que o ocupa', async () => {
    // Quem sai da empresa não leva o mouse da Mesa 1: ele é da mesa. A Ana
    // ocupa a Mesa 1 (caso acima), a mesa tem unidade, e nada saiu no NOME dela
    // neste arquivo — a contagem dela é zero. (A Laura não serve de prova: ela
    // recebeu as unidades dos casos de saldo.)
    const ficha = await api.get<{ posseAberta: { itensEmPosse: number; postosOcupados: number } }>(`/api/users/${cenario.ana}`);
    expect(ficha.body.posseAberta.postosOcupados).toBeGreaterThanOrEqual(1);
    expect(ficha.body.posseAberta.itensEmPosse).toBe(0);
  });

  it('desativado não recebe unidade (409), e cadastro na lixeira também não (404)', async () => {
    const desligada = await criarColaborador(api, { name: 'Dani Desligada', email: 'dani.desligada@teste.local' });
    expect((await api.put(`/api/users/${desligada}`, { isActive: false })).status).toBe(200);

    const mouse = await item('Mouse da desativada', 1);
    const recusa = await sair(mouse.id, { targetType: 'USER', targetUserId: desligada });
    expect(recusa.status).toBe(409);
    expect(recusa.body.error).toMatch(/desativad/i);

    const apagada = await criarColaborador(api, { name: 'Ana Apagada', email: 'ana.apagada@teste.local' });
    expect((await api.delete(`/api/users/${apagada}`)).status).toBe(200);
    expect((await sair(mouse.id, { targetType: 'USER', targetUserId: apagada })).status).toBe(404);
  });
});

describe('a porta fechada e o papel', () => {
  it('as rotas exigem sessão, e apagar e restaurar são do ADMIN', async () => {
    expect((await api.anonimo.get('/api/stock/items')).status).toBe(401);

    const tecnico = await api.comoUsuario('TECNICO');
    const mouse = await item('Mouse do técnico', 1);
    // O técnico opera: cria, entrega, devolve.
    expect((await tecnico.post('/api/stock/items', { name: 'Item do técnico', categoryId: cenario.categoriaEstoqueId })).status).toBe(201);
    // Mas não apaga nem restaura.
    expect((await tecnico.delete(`/api/stock/items/${mouse.id}`)).status).toBe(403);
    expect((await tecnico.post(`/api/stock/items/${mouse.id}/restore`)).status).toBe(403);
  });
});
