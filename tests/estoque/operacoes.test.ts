import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import { cenarioDePosse, criarItemDeEstoque, criarLocal } from '../helpers/fixtures';

// AS OPERAÇÕES DO ESTOQUE do lado de quem LÊ: a listagem com o saldo, a
// movimentação como linha do tempo e a ficha do posto com as unidades na mesa.
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

interface Evento {
  id: string;
  movementId: string;
  action: string;
  at: string;
  qty: number;
  targetLabel: string | null;
}

describe('a listagem', () => {
  it('traz disponível e total por linha, calculados em lote, e a busca filtra pelo nome', async () => {
    const mouse = await item('Mouse da listagem', 4);
    const teclado = await item('Teclado da listagem', 2);
    expect((await api.post(`/api/stock/items/${mouse.id}/checkout`, {
      targetType: 'USER', targetUserId: cenario.laura, qty: 3,
    })).status).toBe(201);

    const { status, body } = await api.get<{ total: number; rows: { id: string; qty: number; fora: number; disponivel: number }[] }>(
      '/api/stock/items?perPage=100',
    );
    expect(status).toBe(200);
    const porId = new Map(body.rows.map((r) => [r.id, r]));
    expect(porId.get(mouse.id)).toMatchObject({ qty: 4, fora: 3, disponivel: 1 });
    expect(porId.get(teclado.id)).toMatchObject({ qty: 2, fora: 0, disponivel: 2 });

    const busca = await api.get<{ rows: { id: string }[] }>('/api/stock/items?q=teclado');
    expect(busca.body.rows.map((r) => r.id)).toContain(teclado.id);
    expect(busca.body.rows.map((r) => r.id)).not.toContain(mouse.id);
  });

  it('a lixeira fica fora da listagem padrão e dentro de ?view=trashed', async () => {
    const apagado = await item('Item apagado da listagem', 1);
    expect((await api.delete(`/api/stock/items/${apagado.id}`)).status).toBe(200);

    const padrao = await api.get<{ rows: { id: string }[] }>('/api/stock/items?perPage=100');
    expect(padrao.body.rows.map((r) => r.id)).not.toContain(apagado.id);
    const lixeira = await api.get<{ rows: { id: string }[] }>('/api/stock/items?view=trashed');
    expect(lixeira.body.rows.map((r) => r.id)).toContain(apagado.id);
  });
});

describe('a movimentação', () => {
  it('é a linha do tempo do item: entrada, saída e devolução, mais recente primeiro', async () => {
    const fone = await item('Fone da movimentação', 2);
    const saida = await api.post<{ unidades: { id: string }[] }>(`/api/stock/items/${fone.id}/checkout`, {
      targetType: 'USER', targetUserId: cenario.laura, notes: 'para o home office',
    });
    expect((await api.post(`/api/stock/items/${fone.id}/adjust`, { kind: 'ENTRADA', qty: 3 })).status).toBe(201);
    expect((await api.post(`/api/stock/movements/${saida.body.unidades[0].id}/checkin`, { notes: 'voltou' })).status).toBe(200);

    const { status, body } = await api.get<{ total: number; rows: Evento[] }>(`/api/stock/items/${fone.id}/movements`);
    expect(status).toBe(200);
    // Três linhas de banco viram QUATRO eventos: a saída devolvida rende dois.
    expect(body.total).toBe(4);
    expect(body.rows.map((e) => e.action)).toEqual(['DEVOLUCAO', 'ENTRADA', 'SAIDA', 'ENTRADA']);

    const devolucao = body.rows[0];
    expect(devolucao.targetLabel).toBe('Laura Souza');
    expect(devolucao.movementId).toBe(saida.body.unidades[0].id);
    // A saída e a devolução têm chaves DIFERENTES para a mesma linha.
    expect(body.rows.find((e) => e.action === 'SAIDA')?.id).not.toBe(devolucao.id);
  });

  it('a saída de N unidades é UM evento na linha do tempo, com qty = N', async () => {
    // As N linhas do `createManyAndReturn` nascem no MESMO instante; é essa
    // igualdade que `agruparSaidas` usa para juntá-las — "5 mouses para a Mesa
    // 1", não cinco eventos de um.
    const mouse = await item('Mouse do lote na linha do tempo', 5);
    const saida = await api.post<{ unidades: { id: string }[] }>(`/api/stock/items/${mouse.id}/checkout`, {
      targetType: 'LOCATION', targetLocationId: cenario.mesa1, qty: 5,
    });
    expect(saida.status).toBe(201);

    const { body } = await api.get<{ rows: Evento[] }>(`/api/stock/items/${mouse.id}/movements`);
    const eventosDeSaida = body.rows.filter((e) => e.action === 'SAIDA');
    expect(eventosDeSaida).toHaveLength(1);
    expect(eventosDeSaida[0].qty).toBe(5);
  });

  it('a qty do evento é recontada no banco, e não fica truncada pela janela', async () => {
    // Um lote de TRÊS linhas, com duas ENTRADAS mais novas depois dele: a
    // janela de 3 linhas pega as 2 ENTRADAS mais UMA das três linhas do lote (a
    // do desempate por id). Sem a recontagem no banco, o evento mostraria
    // "saíram 1" — quando saíram 3. É o mesmo risco que o cabeçalho deste
    // arquivo já descreve para a devolução antiga, agora para o lote.
    const cabo = await item('Cabo do lote truncado pela janela', 10);
    const saida = await api.post<{ unidades: { id: string }[] }>(`/api/stock/items/${cabo.id}/checkout`, {
      targetType: 'LOCATION', targetLocationId: cenario.mesa1, qty: 3,
    });
    expect(saida.status).toBe(201);
    expect((await api.post(`/api/stock/items/${cabo.id}/adjust`, { kind: 'ENTRADA', qty: 1 })).status).toBe(201);
    expect((await api.post(`/api/stock/items/${cabo.id}/adjust`, { kind: 'ENTRADA', qty: 1 })).status).toBe(201);

    const { body } = await api.get<{ rows: Evento[] }>(`/api/stock/items/${cabo.id}/movements?limit=3`);
    const evento = body.rows.find((e) => e.action === 'SAIDA');
    expect(evento).toBeDefined();
    expect(evento?.qty).toBe(3);
  });

  it('não esconde a devolução de hoje de uma saída antiga, mesmo com limite', async () => {
    // A linha da saída é uma das mais ANTIGAS por `createdAt`; a devolução dela
    // é o evento mais RECENTE. Com uma consulta só, ordenada pela data de saída,
    // a linha não entraria no `take` e a devolução sumiria sem erro.
    const cabo = await item('Cabo da devolução antiga', 1);
    const saida = await api.post<{ unidades: { id: string }[] }>(`/api/stock/items/${cabo.id}/checkout`, {
      targetType: 'LOCATION', targetLocationId: cenario.mesa1,
    });
    for (let i = 0; i < 3; i += 1) {
      expect((await api.post(`/api/stock/items/${cabo.id}/adjust`, { kind: 'ENTRADA', qty: 1 })).status).toBe(201);
    }
    expect((await api.post(`/api/stock/movements/${saida.body.unidades[0].id}/checkin`, {})).status).toBe(200);

    const { body } = await api.get<{ rows: Evento[] }>(`/api/stock/items/${cabo.id}/movements?limit=2`);
    expect(body.rows).toHaveLength(2);
    expect(body.rows[0].action).toBe('DEVOLUCAO');
    expect(body.rows[0].targetLabel).toBe('Mesa 1');
  });
});

describe('a ficha do posto', () => {
  it('lista as unidades de estoque na mesa, uma por unidade, e a devolução as tira dali', async () => {
    const mesa = await criarLocal(api, { name: 'Mesa com estoque', isWorkstation: true });
    const mouse = await item('Mouse da ficha do posto', 3);
    const saida = await api.post<{ unidades: { id: string }[] }>(`/api/stock/items/${mouse.id}/checkout`, {
      targetType: 'LOCATION', targetLocationId: mesa, qty: 2,
    });
    expect(saida.status).toBe(201);

    type Ficha = { itens: { id: string; item: { name: string; category: { name: string } } }[]; totalItens: number; totalAtivos: number };
    const antes = await api.get<Ficha>(`/api/workstations/${mesa}`);
    expect(antes.status).toBe(200);
    expect(antes.body.totalItens).toBe(2);
    expect(antes.body.itens.map((u) => u.item.name)).toEqual(['Mouse da ficha do posto', 'Mouse da ficha do posto']);
    // Estoque NÃO conta como ativo: `totalAtivos` é o número que a invariante
    // 19 limita a um, e um mouse não entra nele.
    expect(antes.body.totalAtivos).toBe(0);

    expect((await api.post(`/api/stock/movements/${saida.body.unidades[0].id}/checkin`, {})).status).toBe(200);
    const depois = await api.get<Ficha>(`/api/workstations/${mesa}`);
    expect(depois.body.totalItens).toBe(1);
    expect(depois.body.itens.map((u) => u.id)).toEqual([saida.body.unidades[1].id]);
  });

  it('a devolução de uma unidade já devolvida é 409, e a de um id que não é saída também', async () => {
    const dock = await item('Dock da devolução repetida', 1);
    const saida = await api.post<{ unidades: { id: string }[] }>(`/api/stock/items/${dock.id}/checkout`, {
      targetType: 'USER', targetUserId: cenario.ana,
    });
    const unidade = saida.body.unidades[0].id;

    expect((await api.post(`/api/stock/movements/${unidade}/checkin`, {})).status).toBe(200);
    const repetida = await api.post<{ error: string }>(`/api/stock/movements/${unidade}/checkin`, {});
    expect(repetida.status).toBe(409);
    expect(repetida.body.error).toMatch(/já foi devolvida/i);

    // A ENTRADA do cadastro é um movimento, mas não uma saída: não há o que devolver.
    const entrada = await api.get<{ rows: Evento[] }>(`/api/stock/items/${dock.id}/movements`);
    const cadastro = entrada.body.rows.find((e) => e.action === 'ENTRADA')!;
    expect((await api.post(`/api/stock/movements/${cadastro.movementId}/checkin`, {})).status).toBe(409);

    expect((await api.post('/api/stock/movements/00000000-0000-0000-0000-000000000000/checkin', {})).status).toBe(404);
  });
});
