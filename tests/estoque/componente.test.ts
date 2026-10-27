import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../server/core/database/prismaClient';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import { cenarioDePosse, criarAtivo, criarItemDeEstoque, diaNoBrasil } from '../helpers/fixtures';

// O COMPONENTE (AI) — o item de estoque cuja CATEGORIA é do tipo Componente:
// a memória, o SSD. Vai só para computador, fica nele mesmo quando o
// computador muda de mãos, e sai pelo Retirar (a devolução). O computador com
// componente instalado não recebe baixa nem vai para a lixeira.

let api: ApiDeTeste;
let cenario: Awaited<ReturnType<typeof cenarioDePosse>>;

beforeAll(async () => {
  api = await criarApi();
  cenario = await cenarioDePosse(api);
});

afterAll(async () => {
  await api.fechar();
});

const componente = (name: string, qty: number) =>
  criarItemDeEstoque(api, { name, categoryId: cenario.categoriaComponenteId, qty });

const maquina = (name: string) => criarAtivo(api, { statusId: cenario.statusDeployableId, modelId: cenario.modelId, name });

const entregar = (itemId: string, corpo: Record<string, unknown>) =>
  api.post<{ unidades: { id: string }[]; disponivel: number; error: string }>(`/api/stock/items/${itemId}/checkout`, corpo);

const retirar = (entregaId: string, corpo: Record<string, unknown> = {}) =>
  api.post<{ devolvidas: number; ficaram: number; error: string }>(`/api/stock/checkouts/${entregaId}/checkin`, corpo);

const noComputador = (itemId: string, assetId: string, qty = 1) =>
  entregar(itemId, { targetType: 'ASSET', targetAssetId: assetId, qty });

interface Instalado { id: string; unidades: number; item: { id: string; name: string } }
const componentesDo = async (assetId: string) => (await api.get<Instalado[]>(`/api/assets/${assetId}/components`)).body;

/** '2026-03-10' → '10/03/2026', como a frase do servidor. */
const naFrase = (dia: string) => dia.split('-').reverse().join('/');

describe('a categoria decide para onde o item vai', () => {
  it('o componente vai só para computador, e o resto do estoque nunca vai', async () => {
    const ram = await componente('RAM do destino', 4);
    const mouse = await criarItemDeEstoque(api, { name: 'Mouse do destino', categoryId: cenario.categoriaEstoqueId, qty: 4 });
    const pc = await maquina('Destino');

    const aPessoa = await entregar(ram.id, { targetType: 'PERSON', targetPersonId: cenario.laura });
    expect(aPessoa.status).toBe(422);
    expect(aPessoa.body.error).toBe('"RAM do destino" é componente e vai só para um computador.');
    expect((await entregar(ram.id, { targetType: 'WORKSTATION', targetWorkstationId: cenario.mesa1 })).status).toBe(422);

    const mouseNoPc = await noComputador(mouse.id, pc.id);
    expect(mouseNoPc.status).toBe(422);
    expect(mouseNoPc.body.error).toBe(
      '"Mouse do destino" não é componente: vai para um colaborador ou um posto, não para um computador.',
    );

    const instalada = await noComputador(ram.id, pc.id, 2);
    expect(instalada.status).toBe(201);
    expect(instalada.body.disponivel).toBe(2);
    expect((await componentesDo(pc.id)).map((linha) => [linha.item.name, linha.unidades])).toEqual([['RAM do destino', 2]]);
  });

  it('um alvo só: o computador junto com o colaborador é 422', async () => {
    const ram = await componente('RAM dos dois alvos', 1);
    const pc = await maquina('Dois alvos');
    const duas = await entregar(ram.id, { targetType: 'ASSET', targetAssetId: pc.id, targetPersonId: cenario.laura });
    expect(duas.status).toBe(422);
    expect(duas.body.error).toMatch(/UM alvo/);
    expect((await entregar(ram.id, { targetType: 'ASSET' })).status).toBe(422);
  });

  it('o computador baixado é 409; o da lixeira e o inexistente, 404', async () => {
    const ssd = await componente('SSD do computador que saiu', 3);
    const baixado = await maquina('Baixado');
    expect((await api.post(`/api/assets/${baixado.id}/retire`, { retiredReason: 'VENDIDO' })).status).toBe(200);
    const recusa = await noComputador(ssd.id, baixado.id);
    expect(recusa.status).toBe(409);
    expect(recusa.body.error).toBe(`O ativo ${baixado.assetTag} teve baixa e não pode receber componente.`);

    const naLixeira = await maquina('Na lixeira');
    expect((await api.delete(`/api/assets/${naLixeira.id}`)).status).toBe(200);
    expect((await noComputador(ssd.id, naLixeira.id)).status).toBe(404);
    expect((await noComputador(ssd.id, '00000000-0000-4000-8000-000000000000')).status).toBe(404);
  });

  it('a entrega não vem antes da compra do computador, e a compra não vai para depois dela', async () => {
    const ram = await componente('RAM antes da compra', 2);
    const pc = await maquina('Comprado ontem');
    expect((await api.put(`/api/assets/${pc.id}`, { purchaseDate: diaNoBrasil(-3) })).status).toBe(200);

    const cedo = await entregar(ram.id, { targetType: 'ASSET', targetAssetId: pc.id, checkoutAt: diaNoBrasil(-4) });
    expect(cedo.status).toBe(422);
    expect(cedo.body.error).toBe(
      `A entrega (${naFrase(diaNoBrasil(-4))}) não pode ser antes da compra de ${pc.assetTag} — Comprado ontem `
      + `(${naFrase(diaNoBrasil(-3))}).`,
    );
    expect((await entregar(ram.id, { targetType: 'ASSET', targetAssetId: pc.id, checkoutAt: diaNoBrasil(-3) })).status).toBe(201);

    const compra = await api.put<{ error: string }>(`/api/assets/${pc.id}`, { purchaseDate: diaNoBrasil(-2) });
    expect(compra.status).toBe(422);
    expect(compra.body.error).toBe(
      `A data de compra (${naFrase(diaNoBrasil(-2))}) não pode ser depois do primeiro componente instalado em `
      + `${pc.assetTag} (${naFrase(diaNoBrasil(-3))}).`,
    );
  });
});

describe('o componente fica no computador até o Retirar', () => {
  it('passa pela entrega e pela devolução do computador, e sai pelo Retirar', async () => {
    const ram = await componente('RAM que fica', 4);
    const pc = await maquina('Muda de mãos');
    const instalada = await noComputador(ram.id, pc.id, 2);

    expect((await api.post(`/api/assets/${pc.id}/checkout`, { targetType: 'PERSON', targetPersonId: cenario.ana })).status).toBe(201);
    expect((await api.post(`/api/assets/${pc.id}/checkin`, {})).status).toBe(200);
    expect((await componentesDo(pc.id)).map((linha) => linha.unidades)).toEqual([2]);

    const entregaId = instalada.body.unidades[0].id;
    const uma = await retirar(entregaId, { qty: 1 });
    expect(uma.status).toBe(200);
    expect(uma.body).toMatchObject({ devolvidas: 1, ficaram: 1 });
    expect((await componentesDo(pc.id)).map((linha) => linha.unidades)).toEqual([1]);

    expect((await retirar(entregaId)).status).toBe(200);
    expect(await componentesDo(pc.id)).toEqual([]);
    const denovo = await retirar(entregaId);
    expect(denovo.status).toBe(409);
    expect(denovo.body.error).toBe(`Esta entrega de "RAM que fica" para ${pc.assetTag} — Muda de mãos já foi retirada.`);

    expect((await api.get<{ disponivel: number }>(`/api/stock/items/${ram.id}`)).body.disponivel).toBe(4);
  });

  it('o item e o computador contam a instalação e a retirada no histórico', async () => {
    const ssd = await componente('SSD do histórico', 2);
    const pc = await maquina('Com histórico');
    const instalado = await noComputador(ssd.id, pc.id, 2);
    await retirar(instalado.body.unidades[0].id, { qty: 1 });

    const doItem = await api.get<{ rows: { action: string; targetType: string; targetLabel: string; unidades: number }[] }>(
      `/api/stock/items/${ssd.id}/history`,
    );
    expect(doItem.body.rows.map((evento) => [evento.action, evento.targetType, evento.targetLabel, evento.unidades])).toEqual([
      ['CHECKIN', 'ASSET', `${pc.assetTag} — Com histórico`, 1],
      ['CHECKOUT', 'ASSET', `${pc.assetTag} — Com histórico`, 2],
    ]);

    type Evento = { fonte: string; action: string; componente: { itemLabel: string; unidades: number } | null };
    const doPc = await api.get<{ rows: Evento[] }>(`/api/assets/${pc.id}/history`);
    expect(doPc.body.rows.filter((evento) => evento.fonte === 'COMPONENTE')
      .map((evento) => [evento.action, evento.componente?.itemLabel, evento.componente?.unidades])).toEqual([
      ['CHECKIN', 'SSD do histórico', 1],
      ['CHECKOUT', 'SSD do histórico', 2],
    ]);
  });

  it('"Em quais computadores" acha pela etiqueta, e não mostra o de outro computador', async () => {
    const ram = await componente('RAM da busca', 2);
    const [um, outro] = await Promise.all([maquina('Primeiro'), maquina('Segundo')]);
    await noComputador(ram.id, um.id);
    await noComputador(ram.id, outro.id);

    const busca = await api.get<{ rows: { targetLabel: string; targetAssetId: string }[] }>(
      `/api/stock/items/${ram.id}/checkouts?q=${encodeURIComponent(um.assetTag)}`,
    );
    expect(busca.body.rows.map((linha) => linha.targetAssetId)).toEqual([um.id]);
  });
});

describe('o computador com componente não sai do inventário', () => {
  type Recusa = { error: string; refs: { tipo: string; id: string; nome: string }[] };

  it('baixa e lixeira são 409 com o item em link; depois do Retirar, passam', async () => {
    const ram = await componente('RAM que segura a baixa', 3);
    const pc = await maquina('Vai ser vendido');
    const instalada = await noComputador(ram.id, pc.id, 2);

    const baixa = await api.post<Recusa>(`/api/assets/${pc.id}/retire`, { retiredReason: 'VENDIDO' });
    expect(baixa.status).toBe(409);
    expect(baixa.body.error).toBe(
      `${pc.assetTag} ainda tem os componentes RAM que segura a baixa ×2. Retire pela tela de Estoque antes de dar baixa.`,
    );
    expect(baixa.body.refs).toEqual([{ tipo: 'estoque', id: ram.id, nome: 'RAM que segura a baixa' }]);

    const lixeira = await api.delete<Recusa>(`/api/assets/${pc.id}`);
    expect(lixeira.status).toBe(409);
    expect(lixeira.body.error).toBe(
      'Este ativo ainda tem os componentes RAM que segura a baixa ×2. Retire pela tela de Estoque antes de excluir.',
    );

    expect((await retirar(instalada.body.unidades[0].id)).status).toBe(200);
    expect((await api.post(`/api/assets/${pc.id}/retire`, { retiredReason: 'VENDIDO' })).status).toBe(200);
  });

  it('o item com componente instalado não se exclui: manda retirar', async () => {
    const ssd = await componente('SSD que segura o item', 1);
    const pc = await maquina('Segura o item');
    await noComputador(ssd.id, pc.id);

    const exclusao = await api.delete<{ error: string }>(`/api/stock/items/${ssd.id}`);
    expect(exclusao.status).toBe(409);
    expect(exclusao.body.error).toBe(
      `"SSD que segura o item" ainda tem 1 unidade em uso (${pc.assetTag} — Segura o item). Retire antes de excluir.`,
    );
  });
});

describe('trocar entre estoque e componente', () => {
  it('só sem unidade em uso', async () => {
    const pente = await componente('Pente que vira estoque', 2);
    const pc = await maquina('Do pente');
    const instalado = await noComputador(pente.id, pc.id);

    const troca = await api.put<{ error: string }>(`/api/stock/items/${pente.id}`, { categoryId: cenario.categoriaEstoqueId });
    expect(troca.status).toBe(409);
    expect(troca.body.error).toBe(
      '"Pente que vira estoque" tem 1 unidade em uso e não pode passar de componente para estoque. '
      + 'Retire antes de trocar a categoria.',
    );

    await retirar(instalado.body.unidades[0].id);
    expect((await api.put(`/api/stock/items/${pente.id}`, { categoryId: cenario.categoriaEstoqueId })).status).toBe(200);
  });

  it('o seletor de categoria do item pede os dois tipos de uma vez', async () => {
    const ambas = await api.get<{ id: string }[]>('/api/categories/options?type=STOCK,COMPONENT');
    expect(ambas.status).toBe(200);
    const ids = ambas.body.map((categoria) => categoria.id);
    expect(ids).toContain(cenario.categoriaEstoqueId);
    expect(ids).toContain(cenario.categoriaComponenteId);
    expect(ids).not.toContain(cenario.categoriaId);

    expect((await api.get('/api/categories/options?type=STOCK,QUALQUER')).status).toBe(422);
  });
});

describe('a forma da linha no banco', () => {
  it('o alvo ASSET tem o computador e só ele', async () => {
    const ram = await componente('RAM do CHECK', 1);
    const pc = await maquina('Do CHECK');
    const inserir = (colunas: { targetAssetId?: string; targetPersonId?: string }) => prisma.$executeRawUnsafe(
      `INSERT INTO stock_movements (id, "itemId", "targetType", "targetPersonId", "targetAssetId", "checkoutAt", "createdAt")
       VALUES (gen_random_uuid(), $1::uuid, 'ASSET', $2::uuid, $3::uuid, now(), now())`,
      ram.id, colunas.targetPersonId ?? null, colunas.targetAssetId ?? null,
    ).then(() => null, (erro: Error) => erro.message);

    expect(await inserir({})).toMatch(/stock_movements_forma/);
    expect(await inserir({ targetAssetId: pc.id, targetPersonId: cenario.laura })).toMatch(/stock_movements_forma/);
    expect(await inserir({ targetAssetId: pc.id })).toBeNull();
  });
});
