import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../server/core/database/prismaClient';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import { cenarioDePosse, criarColaborador, criarItemDeEstoque, criarPosto } from '../helpers/fixtures';

// AS INVARIANTES DO ESTOQUE — o saldo calculado, a forma da entrega, o total que
// nunca desce do que está em uso nem fica negativo (o cadastro começa com 1, AJ),
// a categoria do tipo certo, o desativar e o excluir, e a ponta da invariante 6.
// A mesma lógica da licença (AE).
//
// Uma linha de `stock_items` é o item, cada unidade entregue é uma linha de
// `stock_movements`, e o disponível é `qty − COUNT(abertas)` — nunca coluna. Se
// um teste daqui ficar vermelho, o almoxarifado já pode estar mentindo no banco.

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

interface Entrega {
  error: string;
  unidades: { id: string; returnedAt: string | null }[];
  disponivel: number;
}

const entregar = (itemId: string, corpo: Record<string, unknown>) =>
  api.post<Entrega>(`/api/stock/items/${itemId}/checkout`, corpo);

const paraLaura = (itemId: string, qty = 1) =>
  entregar(itemId, { targetType: 'PERSON', targetPersonId: cenario.laura, qty });

const lerItem = (itemId: string) =>
  api.get<{ qty: number; emUso: number; disponivel: number; isActive: boolean; jaEntregue: boolean }>(`/api/stock/items/${itemId}`);

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
    expect(nomes).not.toContain('deletedAt');
  });

  it('o disponível cai com a entrega e volta com a devolução', async () => {
    const mouse = await item('Mouse do saldo', 3);

    const entrega = await paraLaura(mouse.id, 2);
    expect(entrega.status).toBe(201);
    expect(entrega.body.disponivel).toBe(1);
    expect((await lerItem(mouse.id)).body).toMatchObject({ qty: 3, emUso: 2, disponivel: 1 });

    expect((await api.post(`/api/stock/checkouts/${entrega.body.unidades[0].id}/checkin`, { qty: 1 })).status).toBe(200);
    expect((await lerItem(mouse.id)).body).toMatchObject({ qty: 3, emUso: 1, disponivel: 2 });
  });

  it('recusa a entrega sem unidade, com 409 e os números', async () => {
    const teclado = await item('Teclado único', 1);
    expect((await paraLaura(teclado.id)).status).toBe(201);

    const { status, body } = await paraLaura(teclado.id);
    expect(status).toBe(409);
    expect(body.error).toBe('Sem unidade disponível de "Teclado único": 1 no total, 1 em uso. Devolva uma unidade ou aumente o total.');
  });

  it('a entrega de N grava N linhas, e a que pede mais do que há é recusada inteira', async () => {
    const cabo = await item('Cabo em lote', 5);

    const { status, body } = await paraLaura(cabo.id, 3);
    expect(status).toBe(201);
    expect(body.unidades).toHaveLength(3);
    expect(body.unidades.every((u) => u.returnedAt === null)).toBe(true);

    // A entrega de 3 com 2 disponíveis não entrega "o que der".
    const demais = await paraLaura(cabo.id, 3);
    expect(demais.status).toBe(409);
    expect(demais.body.error).toMatch(/a entrega pede 3 e há 2 disponíveis \(5 no total, 3 em uso\)/);
    expect(await prisma.stockMovement.count({ where: { itemId: cabo.id } })).toBe(3);
  });

  it('zero, mais de 100 por vez, ou sem número é 422', async () => {
    const zero = await item('Item da entrega zero', 1);
    expect((await paraLaura(zero.id, 0)).status).toBe(422);
    expect((await paraLaura(zero.id, 101)).status).toBe(422);
  });
});

describe('a entrega ao posto não multiplica por ocupante', () => {
  it('desconta UMA unidade, com duas pessoas na mesa', async () => {
    // Laura e Ana ocupam a Mesa 1. Entregar um mouse à mesa é UMA unidade em
    // uso, qualquer que seja a escala: o saldo do almoxarifado não pode
    // depender do RH.
    for (const personId of [cenario.laura, cenario.ana]) {
      const ocupacao = await api.post(`/api/workstations/${cenario.mesa1}/occupants`, { personId, shift: 'Manhã' });
      expect(ocupacao.status).toBe(201);
    }

    const mouse = await item('Mouse da mesa compartilhada', 2);
    expect((await entregar(mouse.id, { targetType: 'WORKSTATION', targetWorkstationId: cenario.mesa1 })).status).toBe(201);
    expect((await lerItem(mouse.id)).body).toMatchObject({ emUso: 1, disponivel: 1 });
  });

  it('aceita a entrega a um posto VAZIO: é a mesa preparada antes de a pessoa chegar', async () => {
    const vazio = await criarPosto(api, { name: 'Mesa vazia do estoque' });
    const headset = await item('Headset da mesa vazia', 1);
    expect((await entregar(headset.id, { targetType: 'WORKSTATION', targetWorkstationId: vazio })).status).toBe(201);
  });
});

describe('o alvo da entrega é UM — e quem garante é o banco', () => {
  it('recusa as duas FKs preenchidas, e nenhuma, com 422 do use-case', async () => {
    const dock = await item('Dock dos dois alvos', 2);

    const duas = await entregar(dock.id, {
      targetType: 'PERSON', targetPersonId: cenario.laura, targetWorkstationId: cenario.mesa1,
    });
    expect(duas.status).toBe(422);
    expect(duas.body.error).toMatch(/UM alvo/);

    expect((await entregar(dock.id, { targetType: 'WORKSTATION' })).status).toBe(422);
  });

  it('os CHECKs do Postgres recusam a linha incoerente mesmo por fora da API', async () => {
    // O CHECK existe justamente para quem NÃO passa pelo use-case: o psql à
    // mão, um script. Testar por HTTP seria impossível por construção.
    const dock = await item('Dock do CHECK', 1);
    const inserir = (colunas: Record<string, unknown>) => prisma.$executeRawUnsafe(
      `INSERT INTO stock_movements (id, "itemId", "targetType", "targetPersonId", "targetWorkstationId", "checkoutAt", "returnedAt", "returnRecordedAt", "returnKind", "createdAt")
       VALUES (gen_random_uuid(), $1::uuid, $2::"StockTarget", $3::uuid, $4::uuid, now(), $5::timestamp, $6::timestamp, $7::"StockReturnKind", now())`,
      colunas.semItem ? null : dock.id, colunas.targetType, colunas.targetPersonId ?? null, colunas.targetWorkstationId ?? null, colunas.returnedAt ?? null,
      colunas.returnRecordedAt ?? null, colunas.returnKind ?? null,
    ).then(() => null, (erro: Error) => erro.message);

    expect(await inserir({ targetType: 'PERSON', targetPersonId: cenario.laura, targetWorkstationId: cenario.mesa1 }))
      .toMatch(/stock_movements_forma/);
    expect(await inserir({ targetType: 'WORKSTATION', targetPersonId: cenario.laura })).toMatch(/stock_movements_forma/);
    expect(await inserir({
      targetType: 'PERSON', targetPersonId: cenario.laura, returnedAt: '2000-01-01', returnRecordedAt: '2000-01-01', returnKind: 'RETURNED',
    })).toMatch(/stock_movements_devolucao_nao_antecede_entrega/);
    // Como saiu anda com a devolução (AJ): a devolvida sem dizer como, e o "como"
    // na unidade em uso, não entram.
    const devolvida = { targetType: 'PERSON', targetPersonId: cenario.laura, returnedAt: '2999-01-01', returnRecordedAt: '2999-01-01' };
    expect(await inserir(devolvida)).toMatch(/stock_movements_fechamento_com_devolucao/);
    expect(await inserir({ targetType: 'PERSON', targetPersonId: cenario.laura, returnKind: 'RETURNED' }))
      .toMatch(/stock_movements_fechamento_com_devolucao/);
    // O dia da devolução sem o instante do registro — ou o contrário — não entra.
    expect(await inserir({ targetType: 'PERSON', targetPersonId: cenario.laura, returnedAt: '2999-01-01' }))
      .toMatch(/stock_movements_devolucao_registrada/);
    expect(await inserir({ targetType: 'PERSON', targetPersonId: cenario.laura, returnRecordedAt: '2999-01-01' }))
      .toMatch(/stock_movements_devolucao_registrada/);
    // Sem item, só a entrega devolvida e com o nome por escrito (AG).
    expect(await inserir({ semItem: true, targetType: 'PERSON', targetPersonId: cenario.laura }))
      .toMatch(/stock_movements_item_presente/);
    // E a linha bem formada entra.
    expect(await inserir({ targetType: 'WORKSTATION', targetWorkstationId: cenario.mesa1 })).toBeNull();

    // O total negativo também não entra, nem por fora. O zero entra: é o item
    // que acabou (AJ).
    expect(await prisma.$executeRawUnsafe(`UPDATE stock_items SET qty = -1 WHERE id = $1::uuid`, dock.id)
      .then(() => null, (erro: Error) => erro.message)).toMatch(/stock_items_qty_nao_negativa/);
  });

  it('as constraints existem no banco', async () => {
    // A asserção que pega o `db push`: as tabelas nascem certas e o SQL escrito
    // à mão some, porque `db push` não passa pelas migrations.
    const constraints = await prisma.$queryRaw<{ conname: string }[]>`
      SELECT conname FROM pg_constraint
       WHERE contype = 'c' AND conrelid IN ('stock_movements'::regclass, 'stock_items'::regclass)
    `;
    expect(constraints.map((c) => c.conname).sort()).toEqual([
      'stock_items_qty_nao_negativa',
      'stock_movements_devolucao_nao_antecede_entrega',
      'stock_movements_devolucao_registrada',
      'stock_movements_fechamento_com_devolucao',
      'stock_movements_forma',
      'stock_movements_item_presente',
    ]);
  });
});

describe('o total é campo da edição, como a quantidade comprada da licença', () => {
  it('aumenta sempre; reduz até o que está em uso, e não abaixo — 409 com a conta', async () => {
    const fone = await item('Fone do total', 3);
    expect((await paraLaura(fone.id, 2)).status).toBe(201);

    expect((await api.put(`/api/stock/items/${fone.id}`, { qty: 8 })).status).toBe(200);
    expect((await lerItem(fone.id)).body).toMatchObject({ qty: 8, disponivel: 6 });

    const abaixo = await api.put<{ error: string }>(`/api/stock/items/${fone.id}`, { qty: 1 });
    expect(abaixo.status).toBe(409);
    expect(abaixo.body.error).toBe('Não dá para reduzir "Fone do total" para 1: 2 estão em uso. Devolva para liberar.');
    expect((await lerItem(fone.id)).body.qty).toBe(8);

    // Igual ao que está em uso cabe: o disponível fica em zero.
    expect((await api.put(`/api/stock/items/${fone.id}`, { qty: 2 })).status).toBe(200);
    expect((await lerItem(fone.id)).body).toMatchObject({ qty: 2, disponivel: 0 });
  });

  it('o cadastro começa com ao menos 1; a edição leva o total a 0, o item que acabou (AJ)', async () => {
    const corpo = { name: 'Item que nasceria vazio', categoryId: cenario.categoriaEstoqueId };
    const zero = await api.post<{ error: string }>('/api/stock/items', { ...corpo, qty: 0 });
    expect(zero.status).toBe(422);
    expect(zero.body.error).toMatch(/mínimo de 1/);
    expect((await api.post('/api/stock/items', corpo)).status).toBe(422);
    expect((await api.post('/api/stock/items', { ...corpo, qty: 100_001 })).status).toBe(422);
    expect(await prisma.stockItem.count({ where: { name: corpo.name } })).toBe(0);

    const pilha = await item('Pilha que acabou', 2);
    expect((await api.put(`/api/stock/items/${pilha.id}`, { qty: -1 })).status).toBe(422);
    expect((await api.put(`/api/stock/items/${pilha.id}`, { qty: 0 })).status).toBe(200);
    expect((await lerItem(pilha.id)).body).toMatchObject({ qty: 0, disponivel: 0, isActive: true });

    // Com 0, não há o que entregar — e a frase diz o total.
    const semNada = await paraLaura(pilha.id);
    expect(semNada.status).toBe(409);
    expect(semNada.body.error).toBe(
      'Sem unidade disponível de "Pilha que acabou": 0 no total, 0 em uso. Devolva uma unidade ou aumente o total.',
    );
  });

  it('a quantidade é número de verdade: null, texto, booleano e lista são 422 — nunca viram 0 ou 1', async () => {
    // Com `z.coerce.number`, `null` virava 0, `true` virava 1 e `[5]` virava 5.
    const corpo = { name: 'Item da quantidade estrita', categoryId: cenario.categoriaEstoqueId };
    for (const qty of [null, '5', true, [5]]) {
      expect((await api.post('/api/stock/items', { ...corpo, qty })).status).toBe(422);
    }
    expect(await prisma.stockItem.count({ where: { name: corpo.name } })).toBe(0);

    const cabo = await item('Cabo da quantidade estrita', 3);
    for (const qty of [null, true]) {
      expect((await paraLaura(cabo.id, qty as unknown as number)).status).toBe(422);
    }
    const entrega = await paraLaura(cabo.id, 2);
    expect(entrega.status).toBe(201);
    const devolucao = await api.post(`/api/stock/checkouts/${entrega.body.unidades[0].id}/checkin`, { qty: null });
    expect(devolucao.status).toBe(422);
    expect((await lerItem(cabo.id)).body).toMatchObject({ qty: 3, emUso: 2 });
  });

  it('a mudança do total vai para a auditoria, com o de e o para', async () => {
    const resma = await item('Resma auditada', 2);
    expect((await api.put(`/api/stock/items/${resma.id}`, { qty: 7 })).status).toBe(200);

    const edicao = await prisma.auditLog.findFirstOrThrow({
      where: { entityType: 'StockItem', entityId: resma.id, action: 'UPDATE' },
      select: { changes: true },
    });
    expect(edicao.changes).toMatchObject({ qty: { de: 2, para: 7 } });
  });

  it('o nome é único entre todos, desativados inclusive — e o 409 manda reativar', async () => {
    const antigo = await item('Adaptador único', 1);
    expect((await api.post('/api/stock/items', { name: 'Adaptador único', categoryId: cenario.categoriaEstoqueId, qty: 1 })).status).toBe(409);

    expect((await api.put(`/api/stock/items/${antigo.id}`, { isActive: false })).status).toBe(200);
    const recadastro = await api.post<{ error: string }>('/api/stock/items', {
      name: 'Adaptador único', categoryId: cenario.categoriaEstoqueId, qty: 1,
    });
    expect(recadastro.status).toBe(409);
    expect(recadastro.body.error).toMatch(/desativado\. Reative-o/);
  });

  it('o nome não distingue maiúsculas, como nas Configurações — e o 409 diz a grafia que existe', async () => {
    const hub = await item('Hub USB-C', 1);
    const outraGrafia = await api.post<{ error: string }>('/api/stock/items', {
      name: 'hub usb-c', categoryId: cenario.categoriaEstoqueId, qty: 1,
    });
    expect(outraGrafia.status).toBe(409);
    expect(outraGrafia.body.error).toBe('Já existe um item de estoque chamado "Hub USB-C".');

    const outro = await item('Webcam Full HD', 1);
    expect((await api.put(`/api/stock/items/${outro.id}`, { name: 'HUB USB-C' })).status).toBe(409);
    // Corrigir a grafia do PRÓPRIO nome passa: ele não colide consigo mesmo.
    expect((await api.put(`/api/stock/items/${hub.id}`, { name: 'Hub USB-c' })).status).toBe(200);
    // E o `_` é letra, não curinga do ILIKE: "Cabo_1" não é "Cabo 1".
    await item('Cabo 1', 1);
    expect((await api.post('/api/stock/items', { name: 'Cabo_1', categoryId: cenario.categoriaEstoqueId, qty: 1 })).status).toBe(201);
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

  it('e o catálogo não deixa a categoria em uso mudar de tipo — o item desativado conta', async () => {
    const categoria = await api.post<{ id: string }>('/api/categories', { name: 'Categoria presa ao estoque', type: 'STOCK' });
    expect(categoria.status).toBe(201);
    const preso = await criarItemDeEstoque(api, { name: 'Item que segura a categoria', categoryId: categoria.body.id, qty: 1 });
    expect((await api.put(`/api/stock/items/${preso.id}`, { isActive: false })).status).toBe(200);

    const troca = await api.put<{ error: string }>(`/api/categories/${categoria.body.id}`, { type: 'ASSET' });
    expect(troca.status).toBe(409);
    expect(troca.body.error).toMatch(/1 registro/);
  });
});

describe('desativar e excluir', () => {
  it('com unidade em uso não se desativa (409); devolvida, desativa e não recebe entrega nova', async () => {
    const webcam = await item('Webcam desativada', 3);
    const entrega = await paraLaura(webcam.id);
    const emUso = await api.put<{ error: string }>(`/api/stock/items/${webcam.id}`, { isActive: false });
    expect(emUso.status).toBe(409);
    expect(emUso.body.error).toBe('"Webcam desativada" tem 1 unidade em uso e não pode ser desativado. Devolva antes.');

    expect((await api.post(`/api/stock/checkouts/${entrega.body.unidades[0].id}/checkin`, {})).status).toBe(200);
    expect((await api.put(`/api/stock/items/${webcam.id}`, { isActive: false })).status).toBe(200);
    expect((await lerItem(webcam.id)).body).toMatchObject({ isActive: false, emUso: 0 });

    const recusa = await paraLaura(webcam.id);
    expect(recusa.status).toBe(409);
    expect(recusa.body.error).toMatch(/está desativado e não recebe entrega\. .*reative-o antes/);

    // Reativado, volta a entregar.
    expect((await api.put(`/api/stock/items/${webcam.id}`, { isActive: true })).status).toBe(200);
    expect((await paraLaura(webcam.id)).status).toBe(201);
  });

  it('com unidade em uso não se exclui — o 409 diz com quem e manda devolver', async () => {
    const leitor = await item('Leitor em uso', 4);
    expect((await paraLaura(leitor.id, 2)).status).toBe(201);
    expect((await entregar(leitor.id, { targetType: 'WORKSTATION', targetWorkstationId: cenario.mesa1 })).status).toBe(201);

    const recusa = await api.delete<{ error: string }>(`/api/stock/items/${leitor.id}`);
    expect(recusa.status).toBe(409);
    expect(recusa.body.error).toBe('"Leitor em uso" ainda tem 3 unidades em uso (Laura Souza ×2 e Mesa 1). Devolva antes de excluir.');
    expect((await lerItem(leitor.id)).status).toBe(200);
  });

  it('o já entregue e devolvido se exclui (AG): as entregas guardam o nome, e o histórico da pessoa continua', async () => {
    const pessoa = await criarColaborador(api, { name: 'Elisa do Item Excluído', email: 'elisa.excluido@teste.local' });
    const leitor = await item('Leitor que saiu de linha', 2);
    const entrega = await entregar(leitor.id, { targetType: 'PERSON', targetPersonId: pessoa, qty: 2 });
    expect((await api.post(`/api/stock/checkouts/${entrega.body.unidades[0].id}/checkin`, {})).status).toBe(200);

    expect((await api.delete(`/api/stock/items/${leitor.id}`)).status).toBe(204);
    expect((await lerItem(leitor.id)).status).toBe(404);
    const linhas = await prisma.stockMovement.findMany({ where: { id: { in: entrega.body.unidades.map((u) => u.id) } } });
    expect(linhas.map((l) => [l.itemId, l.itemName])).toEqual([[null, 'Leitor que saiu de linha'], [null, 'Leitor que saiu de linha']]);

    type Historico = { rows: { fonte: string; action: string; estoque: { itemId: string | null; itemLabel: string; unidades: number } | null }[] };
    const historico = (await api.get<Historico>(`/api/people/${pessoa}/history`)).body.rows.filter((e) => e.fonte === 'ESTOQUE');
    expect(historico.map((e) => [e.action, e.estoque?.itemLabel, e.estoque?.itemId, e.estoque?.unidades])).toEqual([
      ['CHECKIN', 'Leitor que saiu de linha', null, 2],
      ['CHECKOUT', 'Leitor que saiu de linha', null, 2],
    ]);

    // A tela velha que ainda mostrava a entrega recebe o 409 de "já devolvida".
    const velha = await api.post<{ error: string }>(`/api/stock/checkouts/${entrega.body.unidades[0].id}/checkin`, {});
    expect(velha.status).toBe(409);
    expect(velha.body.error).toMatch(/"Leitor que saiu de linha" para Elisa do Item Excluído já foi devolvida/);

    // O nome fica livre: o item recadastrado é outro, com o histórico zerado.
    expect((await api.post('/api/stock/items', { name: 'Leitor que saiu de linha', categoryId: cenario.categoriaEstoqueId, qty: 1 })).status).toBe(201);
  });

  it('o que nunca saiu some de verdade, e a auditoria guarda o retrato', async () => {
    const errado = await item('Cadastro errado', 4);
    expect((await api.delete(`/api/stock/items/${errado.id}`)).status).toBe(204);
    expect((await lerItem(errado.id)).status).toBe(404);
    expect(await prisma.stockItem.count({ where: { id: errado.id } })).toBe(0);

    const retrato = await prisma.auditLog.findFirstOrThrow({
      where: { entityType: 'StockItem', entityId: errado.id, action: 'DELETE' }, select: { changes: true },
    });
    expect(retrato.changes).toMatchObject({ name: 'Cadastro errado', qty: 4 });
  });

  it('o banco também recusa: a FK não deixa apagar item com entrega', async () => {
    const preso = await item('Item preso pela FK', 1);
    expect((await paraLaura(preso.id)).status).toBe(201);
    const erro = await prisma.$executeRawUnsafe('DELETE FROM stock_items WHERE id = $1::uuid', preso.id)
      .then(() => null, (falha: Error) => falha.message);
    expect(erro).toMatch(/stock_movements_itemId_fkey|foreign key/i);
  });
});

describe('invariante 6 — a ponta do estoque', () => {
  it('pessoa com unidade no nome não se desativa nem se exclui, e o 409 diz QUAIS, com link', async () => {
    const pessoa = await criarColaborador(api, { name: 'Pedro do Estoque', email: 'pedro.estoque@teste.local' });
    const mouse = await item('Mouse do Pedro', 3);
    const teclado = await item('Teclado do Pedro', 1);
    expect((await entregar(mouse.id, { targetType: 'PERSON', targetPersonId: pessoa, qty: 2 })).status).toBe(201);
    expect((await entregar(teclado.id, { targetType: 'PERSON', targetPersonId: pessoa })).status).toBe(201);

    type Recusa = { error: string; refs: { tipo: string; id: string; nome: string }[] };
    const { status, body } = await api.put<Recusa>(`/api/people/${pessoa}`, { isActive: false });
    expect(status).toBe(409);
    expect(body.error).toContain('está com 3 unidades de estoque (Mouse do Pedro ×2 e Teclado do Pedro)');
    expect(body.refs).toEqual([
      { tipo: 'estoque', id: mouse.id, nome: 'Mouse do Pedro' },
      { tipo: 'estoque', id: teclado.id, nome: 'Teclado do Pedro' },
    ]);

    // E não vai para a lixeira: a mesma conta, com o fim da frase trocado.
    const exclusao = await api.delete<Recusa>(`/api/people/${pessoa}`);
    expect(exclusao.status).toBe(409);
    expect(exclusao.body.error).toContain('3 unidades de estoque');
    expect(exclusao.body.error).toContain('antes de excluir');
  });

  it('a unidade do POSTO não conta para a pessoa que o ocupa', async () => {
    // Quem sai da empresa não leva o mouse da Mesa 1: ele é da mesa. A Ana
    // ocupa a Mesa 1 (caso acima), a mesa tem unidade, e nada saiu no NOME dela
    // neste arquivo.
    const postos = await api.get<unknown[]>(`/api/people/${cenario.ana}/occupancies`);
    expect(postos.body.length).toBeGreaterThanOrEqual(1);
    const ficha = await api.get<{ itens: unknown[] }>(`/api/people/${cenario.ana}`);
    expect(ficha.body.itens).toHaveLength(0);
  });

  it('desativado não recebe unidade (409), e cadastro na lixeira também não (404)', async () => {
    const desligada = await criarColaborador(api, { name: 'Dani Desligada', email: 'dani.desligada@teste.local' });
    expect((await api.put(`/api/people/${desligada}`, { isActive: false })).status).toBe(200);

    const mouse = await item('Mouse da desativada', 1);
    const recusa = await entregar(mouse.id, { targetType: 'PERSON', targetPersonId: desligada });
    expect(recusa.status).toBe(409);
    expect(recusa.body.error).toMatch(/desativad/i);

    const apagada = await criarColaborador(api, { name: 'Ana Apagada', email: 'ana.apagada@teste.local' });
    expect((await api.delete(`/api/people/${apagada}`)).status).toBe(200);
    expect((await entregar(mouse.id, { targetType: 'PERSON', targetPersonId: apagada })).status).toBe(404);
  });

  it('o posto com estoque não se exclui, e o 409 diz quais itens, com link', async () => {
    const mesa = await criarPosto(api, { name: 'Mesa que não se exclui' });
    const cabo = await item('Cabo da mesa presa', 4);
    expect((await entregar(cabo.id, { targetType: 'WORKSTATION', targetWorkstationId: mesa, qty: 3 })).status).toBe(201);

    const recusa = await api.delete<{ error: string; refs: { tipo: string; id: string }[] }>(`/api/workstations/${mesa}`);
    expect(recusa.status).toBe(409);
    expect(recusa.body.error).toMatch(/^Este posto ainda tem 3 unidades de estoque \(Cabo da mesa presa ×3\)\. Tire o que está nele agora/);
    expect(recusa.body.refs).toEqual([{ tipo: 'estoque', id: cabo.id, nome: 'Cabo da mesa presa' }]);
  });
});

describe('a porta fechada e o cargo', () => {
  it('as NOVE rotas do domínio exigem sessão — a garantia é por OMISSÃO', async () => {
    // Rota nova sem linha no mapa de permissão é rota que QUALQUER sessão
    // alcança, e nada falha: o boot derruba isso (D137/D148), mas o que se
    // prova aqui é o efeito fim-a-fim, rota por rota.
    const falso = '00000000-0000-0000-0000-000000000000';
    const rotas: { metodo: 'get' | 'post' | 'put' | 'delete'; url: string }[] = [
      { metodo: 'get', url: '/api/stock/items' },
      { metodo: 'get', url: `/api/stock/items/${falso}` },
      { metodo: 'get', url: `/api/stock/items/${falso}/checkouts` },
      { metodo: 'get', url: `/api/stock/items/${falso}/history` },
      { metodo: 'post', url: '/api/stock/items' },
      { metodo: 'put', url: `/api/stock/items/${falso}` },
      { metodo: 'delete', url: `/api/stock/items/${falso}` },
      { metodo: 'post', url: `/api/stock/items/${falso}/checkout` },
      { metodo: 'post', url: `/api/stock/checkouts/${falso}/checkin` },
    ];

    for (const { metodo, url } of rotas) {
      const resposta = metodo === 'get'
        ? await api.anonimo.get(url)
        : await api.anonimo[metodo](url, {});
      expect(resposta.status, `${metodo.toUpperCase()} ${url}`).toBe(401);
    }
  });

  it('as rotas antigas não existem mais', async () => {
    const falso = '00000000-0000-0000-0000-000000000000';
    for (const url of [`/api/stock/items/${falso}/adjust`, `/api/stock/items/${falso}/restore`, `/api/stock/movements/${falso}/checkin`]) {
      expect((await api.post(url, {})).status, url).toBe(404);
    }
  });
});
