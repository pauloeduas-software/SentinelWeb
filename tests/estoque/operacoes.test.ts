import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import { cenarioDePosse, criarItemDeEstoque } from '../helpers/fixtures';
import { prisma } from '../../server/core/database/prismaClient';

// AS OPERAÇÕES DO ESTOQUE e o que elas fazem com a POSSE da F4.
//
// Aqui estão os dois testes mais caros da fase:
//
//   1. o desligamento que NÃO pode esvaziar o posto (o `targetType: 'USER'`);
//   2. a devolução parcial que DIVIDE a linha (D38).
//
// Os dois falham em silêncio se quebrarem: no primeiro, o saldo "bate" e o
// inventário mente; no segundo, o estado atual continua certo e o histórico
// desaparece.

let api: ApiDeTeste;
let cenario: Awaited<ReturnType<typeof cenarioDePosse>>;

beforeAll(async () => {
  api = await criarApi();
  cenario = await cenarioDePosse(api);
});

afterAll(async () => {
  await api.fechar();
});

describe('o desligamento fecha o que é da PESSOA e deixa o que é do POSTO', () => {
  it('devolve o direto, mantém as cinco unidades da mesa', async () => {
    const item = await criarItemDeEstoque(api, 'accessories', {
      name: 'Mouse do offboard', categoryId: cenario.categoriaAcessorioId, qty: 10,
    });

    await api.post(`/api/locations/${cenario.mesa1}/occupants`, { userId: cenario.laura, shift: 'Manhã' });
    await api.post(`/api/locations/${cenario.mesa1}/occupants`, { userId: cenario.ana, shift: 'Tarde' });

    // 5 unidades ao POSTO e 1 DIRETA para a Laura.
    for (let i = 0; i < 5; i += 1) {
      await api.post(`/api/accessories/${item.id}/checkout`, {
        targetType: 'LOCATION', targetLocationId: cenario.mesa1,
      });
    }
    await api.post(`/api/accessories/${item.id}/checkout`, {
      targetType: 'USER', targetUserId: cenario.laura,
    });

    expect((await api.get<{ disponivel: number }>(`/api/accessories/${item.id}`)).body.disponivel).toBe(4);

    const desligamento = await api.post<{ acessoriosDevolvidos: { accessoryName: string }[] }>(
      `/api/users/${cenario.laura}/offboard`, { notes: 'saiu da empresa' },
    );
    expect(desligamento.status).toBe(200);
    expect(desligamento.body.acessoriosDevolvidos).toHaveLength(1);

    // ═══ A ASSERÇÃO QUE IMPORTA ═══
    //
    // Sem o `targetType: 'USER'` no `where` do desligamento, as 5 unidades da
    // Mesa 1 voltariam ao estoque — e elas continuam FISICAMENTE na mesa, agora
    // com a Ana. O saldo bateria e o inventário mentiria, sem erro em lugar
    // nenhum.
    const doPosto = await prisma.accessoryCheckout.count({
      where: { accessoryId: item.id, targetType: 'LOCATION', checkedInAt: null },
    });
    expect(doPosto).toBe(5);

    const daLaura = await prisma.accessoryCheckout.count({
      where: { accessoryId: item.id, targetType: 'USER', targetUserId: cenario.laura, checkedInAt: null },
    });
    expect(daLaura).toBe(0);

    // O disponível subiu 1, não 6.
    expect((await api.get<{ disponivel: number }>(`/api/accessories/${item.id}`)).body.disponivel).toBe(5);
  });

  it('a Ana continua respondendo pelas cinco, e a Laura por nenhuma', async () => {
    const daAna = await api.get<{ acessorios: { via: string }[] }>(`/api/users/${cenario.ana}/holdings`);
    expect(daAna.body.acessorios.filter((a) => a.via === 'POSTO')).toHaveLength(5);

    const daLaura = await api.get<{ acessorios: unknown[] }>(`/api/users/${cenario.laura}/holdings`);
    // A ocupação dela foi encerrada junto, então nem por posto ela responde.
    expect(daLaura.body.acessorios).toEqual([]);
  });

  it('o 409 do DELETE conta as unidades diretas, e só elas', async () => {
    const item = await criarItemDeEstoque(api, 'accessories', {
      name: 'Mouse do 409', categoryId: cenario.categoriaAcessorioId, qty: 3,
    });
    const pessoa = await api.post<{ id: string }>('/api/users', {
      name: 'Quem tem mouse', email: 'mouse409@teste.local',
    });

    await api.post(`/api/accessories/${item.id}/checkout`, {
      targetType: 'USER', targetUserId: pessoa.body.id,
    });

    const recusa = await api.delete<{ error: string; acessoriosEmPosse: number }>(
      `/api/users/${pessoa.body.id}`,
    );
    expect(recusa.status).toBe(409);
    expect(recusa.body.acessoriosEmPosse).toBe(1);
    expect(recusa.body.error).toContain('acessório');

    // Desligada, o cadastro libera — o desligamento fechou a unidade direta.
    await api.post(`/api/users/${pessoa.body.id}/offboard`, {});
    expect((await api.delete(`/api/users/${pessoa.body.id}`)).status).toBe(200);
  });

  it('o posto mostra os acessórios dele, em lista própria', async () => {
    const posto = await api.get<{ totalAtivos: number; totalAcessorios: number }>(
      `/api/workstations/${cenario.mesa1}`,
    );
    expect(posto.body.totalAcessorios).toBe(5);
    // Lista SEPARADA dos ativos: um acessório não tem etiqueta nem série, e a
    // tabela de ativos mostra as duas.
    expect(posto.body.totalAtivos).toBe(0);
  });
});

describe('D38 — a retirada parcial divide a linha', () => {
  it('fecha a de 4 e abre uma de 2', async () => {
    const item = await criarItemDeEstoque(api, 'components', {
      name: 'RAM que sai pela metade', categoryId: cenario.categoriaComponenteId, qty: 8,
    });

    const instalacao = await api.post<{ id: string }>(`/api/components/${item.id}/attach`, {
      assetId: cenario.ativo.id, qty: 4,
    });
    expect(instalacao.status).toBe(201);

    const retirada = await api.post<{ sucessora: { assignedQty: number } | null }>(
      `/api/components/attachments/${instalacao.body.id}/detach`, { qty: 2 },
    );
    expect(retirada.status).toBe(200);
    expect(retirada.body.sucessora?.assignedQty).toBe(2);

    const linhas = await prisma.componentAsset.findMany({
      where: { componentId: item.id },
      select: { assignedQty: true, detachedAt: true },
      orderBy: { attachedAt: 'asc' },
    });

    // Decrementar `assignedQty` para 2 na linha aberta seria uma linha de
    // código a menos e apagaria a resposta de "quantos pentes estavam nessa
    // máquina em março?".
    expect(linhas.map((l) => ({ qty: l.assignedQty, aberta: l.detachedAt === null })))
      .toEqual([{ qty: 4, aberta: false }, { qty: 2, aberta: true }]);

    // A SOMA DAS ABERTAS é o estado atual, e é o que o saldo usa.
    expect((await api.get<{ disponivel: number }>(`/api/components/${item.id}`)).body.disponivel).toBe(6);
  });

  it('a retirada TOTAL não abre sucessora', async () => {
    const item = await criarItemDeEstoque(api, 'components', {
      name: 'HD que sai inteiro', categoryId: cenario.categoriaComponenteId, qty: 2,
    });
    const instalacao = await api.post<{ id: string }>(`/api/components/${item.id}/attach`, {
      assetId: cenario.ativo.id, qty: 2,
    });

    // `qty` ausente = retira tudo.
    const retirada = await api.post<{ sucessora: unknown }>(
      `/api/components/attachments/${instalacao.body.id}/detach`, {},
    );
    expect(retirada.body.sucessora).toBeNull();
    expect(await prisma.componentAsset.count({ where: { componentId: item.id } })).toBe(1);
    expect((await api.get<{ disponivel: number }>(`/api/components/${item.id}`)).body.disponivel).toBe(2);
  });

  it('recusa retirar mais do que a linha tem, e retirar duas vezes', async () => {
    const item = await criarItemDeEstoque(api, 'components', {
      name: 'SSD da recusa', categoryId: cenario.categoriaComponenteId, qty: 5,
    });
    const instalacao = await api.post<{ id: string }>(`/api/components/${item.id}/attach`, {
      assetId: cenario.ativo.id, qty: 2,
    });

    expect((await api.post(`/api/components/attachments/${instalacao.body.id}/detach`, { qty: 3 })).status)
      .toBe(422);

    expect((await api.post(`/api/components/attachments/${instalacao.body.id}/detach`, {})).status).toBe(200);
    expect((await api.post(`/api/components/attachments/${instalacao.body.id}/detach`, {})).status).toBe(409);
  });

  it('a aba Componentes do ativo mostra só o que está DENTRO agora', async () => {
    const dentro = await api.get<{ assignedQty: number; component: { name: string } }[]>(
      `/api/assets/${cenario.ativo.id}/components`,
    );
    expect(dentro.status).toBe(200);

    const ram = dentro.body.find((linha) => linha.component.name === 'RAM que sai pela metade');
    expect(ram?.assignedQty).toBe(2);

    // O que foi retirado por inteiro não aparece: a pergunta é de ESTADO.
    expect(dentro.body.some((linha) => linha.component.name === 'HD que sai inteiro')).toBe(false);
  });
});

describe('a movimentação une as duas fontes na leitura', () => {
  it('mostra saídas e ajustes na mesma linha do tempo, sem uma terceira tabela', async () => {
    const item = await criarItemDeEstoque(api, 'accessories', {
      name: 'Headset da movimentação', categoryId: cenario.categoriaAcessorioId, qty: 2,
    });

    const entrega = await api.post<{ id: string }>(`/api/accessories/${item.id}/checkout`, {
      targetType: 'USER', targetUserId: cenario.ana,
    });
    await api.post(`/api/accessories/checkouts/${entrega.body.id}/checkin`, {});
    await api.post(`/api/accessories/${item.id}/adjust-quantity`, { delta: 5, reason: 'COMPRA' });

    const movimentos = await api.get<{ fonte: string; action: string; qty: number }[]>(
      `/api/accessories/${item.id}/movements`,
    );

    // Mais recente primeiro, e as duas fontes juntas: o ajuste vem do
    // `stock_logs`, a entrega e a devolução de `accessory_checkouts`.
    expect(movimentos.body.map((m) => `${m.fonte}:${m.action}:${m.qty}`)).toEqual([
      'AJUSTE:ADJUST:5',
      'SAIDA:CHECKIN:1',
      'SAIDA:CHECKOUT:-1',
    ]);
  });
});

describe('o alerta de estoque baixo', () => {
  it('lista só quem tem piso e está abaixo dele', async () => {
    const comPiso = await criarItemDeEstoque(api, 'consumables', {
      name: 'Toner que acaba', categoryId: cenario.categoriaConsumivelId, qty: 10, minQty: 8,
    });
    const semPiso = await criarItemDeEstoque(api, 'consumables', {
      name: 'Café sem piso', categoryId: cenario.categoriaConsumivelId, qty: 1,
    });

    // Ainda não disparou: 10 disponíveis contra um piso de 8.
    let alertas = await api.get<{ estoqueBaixo: { id: string }[] }>('/api/stock/alerts?tipo=CONSUMABLE');
    expect(alertas.body.estoqueBaixo.map((i) => i.id)).not.toContain(comPiso.id);

    await api.post(`/api/consumables/${comPiso.id}/consume`, { userId: cenario.ana, qty: 5 });

    alertas = await api.get('/api/stock/alerts?tipo=CONSUMABLE');
    expect(alertas.body.estoqueBaixo).toContainEqual(
      expect.objectContaining({ id: comPiso.id, disponivel: 5, minQty: 8 }),
    );
    // Sem `minQty` não há piso, então não há alerta — nem com 1 unidade.
    expect(alertas.body.estoqueBaixo.map((i) => i.id)).not.toContain(semPiso.id);
  });

  it('o filtro de tipo é allowlist: valor desconhecido é 422', async () => {
    expect((await api.get('/api/stock/alerts?tipo=LICENSE')).status).toBe(422);
    expect((await api.get('/api/stock/alerts?tip=ACCESSORY')).status).toBe(422);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// O QUE A REVISÃO DA FASE ENCONTROU — e que nenhum dos testes acima pegava.
//
// Os três daqui falhavam do jeito mais caro: sem erro nenhum. Um apagava dado
// (a observação da instalação), outro prendia unidades fora do estoque para
// sempre (o ativo na lixeira com peça dentro), e o terceiro escondia da lista
// o evento MAIS RECENTE do item.
// ═════════════════════════════════════════════════════════════════════════════

describe('a linha de instalação guarda DOIS eventos, com duas observações', () => {
  it('a nota da retirada não apaga a da instalação', async () => {
    const item = await criarItemDeEstoque(api, 'components', {
      name: 'RAM das duas notas', categoryId: cenario.categoriaComponenteId, qty: 4,
    });
    const instalacao = await api.post<{ id: string }>(`/api/components/${item.id}/attach`, {
      assetId: cenario.ativo.id, qty: 4, notes: 'upgrade de 8 para 16 GB',
    });

    await api.post(`/api/components/attachments/${instalacao.body.id}/detach`, {
      qty: 2, notes: '2 pentes com defeito',
    });

    // Com UMA coluna para os dois eventos, "upgrade de 8 para 16 GB" era
    // sobrescrito — e a movimentação, que lê a mesma coluna nas duas linhas,
    // passava a mostrar o texto da RETIRADA no evento da INSTALAÇÃO.
    const linha = await prisma.componentAsset.findUniqueOrThrow({
      where: { id: instalacao.body.id },
      select: { notes: true, detachNotes: true },
    });
    expect(linha).toEqual({ notes: 'upgrade de 8 para 16 GB', detachNotes: '2 pentes com defeito' });
  });

  it('a movimentação rotula o par como PARCIAL, e não inventa uma instalação', async () => {
    const item = await criarItemDeEstoque(api, 'components', {
      name: 'RAM do rótulo parcial', categoryId: cenario.categoriaComponenteId, qty: 6,
    });
    const instalacao = await api.post<{ id: string }>(`/api/components/${item.id}/attach`, {
      assetId: cenario.ativo.id, qty: 4, notes: 'entrada',
    });
    await api.post(`/api/components/attachments/${instalacao.body.id}/detach`, { qty: 2, notes: 'saída' });

    const movimentos = await api.get<{
      action: string; qty: number; notes: string | null;
      parcial: { retirada: number; de: number } | null;
    }[]>(`/api/components/${item.id}/movements`);

    // DOIS eventos, não três. A sucessora não é instalação nova: aquelas 2
    // unidades nunca voltaram ao estoque, e contá-las como entrada dava
    // "instalou 4, retirou 4, instalou 2" — três movimentos para um fato só,
    // com a soma batendo por causa do evento inventado no meio.
    expect(movimentos.body.map((m) => `${m.action}:${m.qty}`)).toEqual([
      'UNINSTALL:2',
      'INSTALL:-4',
    ]);

    // É o preço declarado do D38, pago: a linha diz o que aconteceu.
    expect(movimentos.body[0].parcial).toEqual({ retirada: 2, de: 4 });
    expect(movimentos.body[0].notes).toBe('saída');
    expect(movimentos.body[1].parcial).toBeNull();
    expect(movimentos.body[1].notes).toBe('entrada');

    // E o estado atual continua sendo a soma das abertas.
    expect((await api.get<{ disponivel: number }>(`/api/components/${item.id}`)).body.disponivel).toBe(4);
  });

  it('a retirada TOTAL não é parcial', async () => {
    const item = await criarItemDeEstoque(api, 'components', {
      name: 'RAM que sai inteira', categoryId: cenario.categoriaComponenteId, qty: 3,
    });
    const instalacao = await api.post<{ id: string }>(`/api/components/${item.id}/attach`, {
      assetId: cenario.ativo.id, qty: 3,
    });
    await api.post(`/api/components/attachments/${instalacao.body.id}/detach`, {});

    const movimentos = await api.get<{ action: string; qty: number; parcial: unknown }[]>(
      `/api/components/${item.id}/movements`,
    );
    expect(movimentos.body.map((m) => `${m.action}:${m.qty}`)).toEqual(['UNINSTALL:3', 'INSTALL:-3']);
    expect(movimentos.body[0].parcial).toBeNull();
  });
});

describe('o ativo com peça dentro não vai para a lixeira', () => {
  it('recusa com 409 e diz quantas unidades estão presas', async () => {
    const componente = await criarItemDeEstoque(api, 'components', {
      name: 'SSD que prende o ativo', categoryId: cenario.categoriaComponenteId, qty: 4,
    });
    const ativo = await api.post<{ id: string }>('/api/assets', {
      statusId: cenario.statusDeployableId, modelId: cenario.modelId,
    });
    const instalacao = await api.post<{ id: string }>(`/api/components/${componente.id}/attach`, {
      assetId: ativo.body.id, qty: 4,
    });
    expect(instalacao.status).toBe(201);

    // ═══ A ASSERÇÃO QUE IMPORTA ═══
    //
    // Sem esta recusa, o ativo ia para a lixeira levando as 4 unidades: o saldo
    // do componente continuava descontado (a contagem olha `component_assets`,
    // que não tem `deletedAt` e não sabe que o ativo sumiu) e a tela que
    // ofereceria a retirada respondia 404. Peça fora do estoque, para sempre,
    // sem caminho de volta por tela nenhuma — e com o saldo "batendo".
    //
    // O `onDelete: Restrict` da FK não cobre: apagar aqui é `UPDATE deletedAt`,
    // o Postgres não vê DELETE e a FK não é consultada.
    const recusa = await api.delete<{ error: string; componentesInstalados: number }>(
      `/api/assets/${ativo.body.id}`,
    );
    expect(recusa.status).toBe(409);
    expect(recusa.body.componentesInstalados).toBe(4);
    expect(recusa.body.error).toBe(
      'Este ativo ainda tem 4 unidades de componente instalada(s). '
      + 'Retire as peças pela aba Componentes antes de excluir.',
    );

    // Retirada a peça, a lixeira libera — e o saldo volta inteiro.
    await api.post(`/api/components/attachments/${instalacao.body.id}/detach`, {});
    expect((await api.delete(`/api/assets/${ativo.body.id}`)).status).toBe(200);
    expect((await api.get<{ disponivel: number }>(`/api/components/${componente.id}`)).body.disponivel)
      .toBe(4);
  });
});

describe('a movimentação não esconde o evento mais recente', () => {
  it('a devolução de hoje de uma entrega antiga vem no topo', async () => {
    const item = await criarItemDeEstoque(api, 'accessories', {
      name: 'Mouse da entrega antiga', categoryId: cenario.categoriaAcessorioId, qty: 5,
    });

    // Uma entrega ANTIGA, que só volta no fim.
    const antiga = await api.post<{ id: string }>(`/api/accessories/${item.id}/checkout`, {
      targetType: 'USER', targetUserId: cenario.ana,
    });

    // E três entregas/devoluções mais novas por cima dela.
    for (let i = 0; i < 3; i += 1) {
      const nova = await api.post<{ id: string }>(`/api/accessories/${item.id}/checkout`, {
        targetType: 'USER', targetUserId: cenario.ana,
      });
      await api.post(`/api/accessories/checkouts/${nova.body.id}/checkin`, {});
    }

    await api.post(`/api/accessories/checkouts/${antiga.body.id}/checkin`, {});

    // Com UMA consulta por fonte, ordenada por `checkedOutAt`, a linha da
    // entrega antiga não entrava no `take` — e a devolução dela, que é o evento
    // MAIS RECENTE do item, sumia de uma lista que promete "mais recente
    // primeiro". Sem erro, e com um topo plausível no lugar.
    const movimentos = await api.get<{ id: string }[]>(
      `/api/accessories/${item.id}/movements?limit=2`,
    );
    expect(movimentos.body).toHaveLength(2);
    expect(movimentos.body[0].id).toBe(`saida:${antiga.body.id}:devolucao`);
  });
});
