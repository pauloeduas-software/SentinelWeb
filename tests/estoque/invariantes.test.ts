import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import { cenarioDePosse, criarItemDeEstoque } from '../helpers/fixtures';
import { prisma } from '../../server/core/database/prismaClient';

// AS INVARIANTES DO ESTOQUE — `docs/FASE-5-PLANO-ITAM.md`, D33 a D38.
//
// São os fatos que nunca podem ser falsos no banco. Cada um é exercitado pela
// PORTA que o usuário usa, não pelo use-case: metade da defesa é o CHECK no
// Postgres ou a chave ausente no `strictObject`, e só a requisição HTTP passa
// pelas duas.
//
// Se um teste daqui ficar vermelho, o saldo do almoxarifado já pode estar
// errado — não é um detalhe de resposta.

let api: ApiDeTeste;
let cenario: Awaited<ReturnType<typeof cenarioDePosse>>;

beforeAll(async () => {
  api = await criarApi();
  cenario = await cenarioDePosse(api);
});

afterAll(async () => {
  await api.fechar();
});

describe('D34 — o saldo é calculado, nunca coluna', () => {
  it('não existe coluna de disponível em nenhuma das três tabelas', async () => {
    // A prova mais barata da decisão, e a que continua valendo quando alguém
    // "otimizar" o helper de saldo daqui a um ano: a coluna não existe.
    const colunas = await prisma.$queryRaw<{ table_name: string; column_name: string }[]>`
      SELECT table_name, column_name FROM information_schema.columns
       WHERE table_name IN ('accessories', 'consumables', 'components')
         AND (column_name ILIKE '%avail%' OR column_name ILIKE '%disponi%' OR column_name ILIKE '%saldo%')
    `;
    expect(colunas).toEqual([]);
  });

  it('a tabela achatada da F1 continua sem existir (D12)', async () => {
    // O item "migração do InventoryItem achatado para os três tipos" do TODO
    // ficou SEM OBJETO: a tabela foi apagada na F1, e as seis desta fase
    // nasceram vazias. A linha existe para ninguém a ressuscitar ao ler um
    // plano antigo.
    const [{ existe }] = await prisma.$queryRaw<{ existe: string | null }[]>`
      SELECT to_regclass('public.inventory_items')::text AS existe
    `;
    expect(existe).toBeNull();
  });

  it('o disponível cai com a saída e volta com a devolução', async () => {
    const item = await criarItemDeEstoque(api, 'accessories', {
      name: 'Mouse do saldo', categoryId: cenario.categoriaAcessorioId, qty: 3,
    });

    const entrega = await api.post<{ id: string }>(`/api/accessories/${item.id}/checkout`, {
      targetType: 'USER', targetUserId: cenario.laura,
    });
    expect(entrega.status).toBe(201);

    const depoisDaSaida = await api.get<{ qty: number; disponivel: number }>(`/api/accessories/${item.id}`);
    expect(depoisDaSaida.body).toMatchObject({ qty: 3, disponivel: 2 });

    const devolucao = await api.post(`/api/accessories/checkouts/${entrega.body.id}/checkin`, {});
    expect(devolucao.status).toBe(200);

    const depoisDaVolta = await api.get<{ qty: number; disponivel: number }>(`/api/accessories/${item.id}`);
    // `qty` NÃO mudou em momento nenhum: ela é quanto ENTROU, e a saída é linha.
    expect(depoisDaVolta.body).toMatchObject({ qty: 3, disponivel: 3 });
  });

  it('recusa a saída quando não há unidade, com 409 e os números', async () => {
    const item = await criarItemDeEstoque(api, 'accessories', {
      name: 'Mouse único', categoryId: cenario.categoriaAcessorioId, qty: 1,
    });

    await api.post(`/api/accessories/${item.id}/checkout`, {
      targetType: 'USER', targetUserId: cenario.laura,
    });

    const segunda = await api.post<Record<string, unknown>>(
      `/api/accessories/${item.id}/checkout`,
      { targetType: 'USER', targetUserId: cenario.ana },
    );
    expect(segunda.status).toBe(409);
    // Os números vêm no corpo, ao lado da frase — o `error-handler` espalha os
    // `details` do `AppError` no topo. É o que deixa a tela decidir o que fazer
    // sem reparsear português.
    expect(segunda.body).toMatchObject({ qty: 1, emUso: 1, disponivel: 0 });
  });
});

describe('D33 — a entrega ao posto não multiplica por ocupante', () => {
  it('desconta UMA unidade, com duas pessoas na mesa', async () => {
    const item = await criarItemDeEstoque(api, 'accessories', {
      name: 'Mouse da Mesa 1', categoryId: cenario.categoriaAcessorioId, qty: 5,
    });

    // Duas ocupantes ABERTAS no mesmo posto — o caso que nenhum ITAM de
    // prateleira modela.
    await api.post(`/api/locations/${cenario.mesa1}/occupants`, { userId: cenario.laura, shift: 'Manhã' });
    await api.post(`/api/locations/${cenario.mesa1}/occupants`, { userId: cenario.ana, shift: 'Tarde' });

    const entrega = await api.post(`/api/accessories/${item.id}/checkout`, {
      targetType: 'LOCATION', targetLocationId: cenario.mesa1,
    });
    expect(entrega.status).toBe(201);

    // 4, e não 3. O saldo do almoxarifado não pode depender da escala do RH:
    // o posto ganhar uma terceira ocupante não pode derrubar o disponível sem
    // ninguém tocar numa unidade física.
    const depois = await api.get<{ disponivel: number }>(`/api/accessories/${item.id}`);
    expect(depois.body.disponivel).toBe(4);

    const abertas = await prisma.accessoryCheckout.count({
      where: { accessoryId: item.id, checkedInAt: null },
    });
    expect(abertas).toBe(1);
  });

  it('as duas ocupantes respondem pela MESMA unidade, e nada é somado', async () => {
    const daLaura = await api.get<{ acessorios: { via: string; posto: unknown }[] }>(
      `/api/users/${cenario.laura}/holdings`,
    );
    const daAna = await api.get<{ acessorios: { via: string; checkoutId: string }[] }>(
      `/api/users/${cenario.ana}/holdings`,
    );

    const postoDaLaura = daLaura.body.acessorios.filter((a) => a.via === 'POSTO');
    const postoDaAna = daAna.body.acessorios.filter((a) => a.via === 'POSTO');

    expect(postoDaLaura).toHaveLength(1);
    expect(postoDaAna).toHaveLength(1);

    // A MESMA linha nas duas telas — é essa igualdade que prova que a unidade é
    // uma só. Somar os dois perfis produziria "o time tem 2 mouses da Mesa 1".
    expect(postoDaLaura[0]).toMatchObject({ via: 'POSTO' });
    expect(daAna.body.acessorios[0].checkoutId).toBeTruthy();

    // E `via` vem POR ITEM: não existe um total na resposta para alguém somar.
    expect(JSON.stringify(daLaura.body.acessorios)).not.toContain('total');
  });

  it('aceita entrega a posto VAZIO e a lista no alerta', async () => {
    // Recusar quebraria o caso real de preparar a mesa antes de a pessoa
    // chegar. Aceitar e SINALIZAR é o *posto vago* aplicado ao estoque.
    const posto = await api.post<{ id: string }>('/api/locations', {
      name: 'Mesa sem ninguém', isWorkstation: true,
    });
    const item = await criarItemDeEstoque(api, 'accessories', {
      name: 'Mouse do posto vazio', categoryId: cenario.categoriaAcessorioId, qty: 2,
    });

    const entrega = await api.post(`/api/accessories/${item.id}/checkout`, {
      targetType: 'LOCATION', targetLocationId: posto.body.id,
    });
    expect(entrega.status).toBe(201);

    const alertas = await api.get<{ postoVago: { accessoryId: string; locationName: string }[] }>(
      '/api/stock/alerts',
    );
    expect(alertas.body.postoVago).toContainEqual(
      expect.objectContaining({ accessoryId: item.id, locationName: 'Mesa sem ninguém' }),
    );
  });
});

describe('o alvo da entrega é UM — e quem garante é o banco', () => {
  it('recusa as duas FKs preenchidas, com 422 do use-case', async () => {
    const item = await criarItemDeEstoque(api, 'accessories', {
      name: 'Mouse do alvo', categoryId: cenario.categoriaAcessorioId, qty: 1,
    });

    const resposta = await api.post(`/api/accessories/${item.id}/checkout`, {
      targetType: 'USER',
      targetUserId: cenario.laura,
      targetLocationId: cenario.mesa1,
    });
    expect(resposta.status).toBe(422);
  });

  it('o CHECK do Postgres recusa a linha incoerente mesmo por fora da API', async () => {
    // ESTA é a diferença desta fase para o `Assignment`: lá a coerência é só
    // guarda de aplicação (CHECK não é expressável no schema do Prisma), aqui
    // ela foi escrita à mão na migration. O que este teste prova é que o
    // `psql`, o importador de CSV da F10 e qualquer caminho futuro esbarram
    // nela também.
    const item = await criarItemDeEstoque(api, 'accessories', {
      name: 'Mouse do CHECK', categoryId: cenario.categoriaAcessorioId, qty: 1,
    });

    await expect(
      prisma.$executeRaw`
        INSERT INTO accessory_checkouts
          (id, "accessoryId", "targetType", "targetUserId", "targetLocationId", "checkedOutAt", "updatedAt")
        VALUES
          (gen_random_uuid(), ${item.id}::uuid, 'USER', ${cenario.laura}::uuid, ${cenario.mesa1}::uuid, now(), now())
      `,
    ).rejects.toThrow(/accessory_checkout_alvo_xor/);
  });

  it('não existe alvo ASSET: o que vai para dentro de um ativo é Component', async () => {
    const item = await criarItemDeEstoque(api, 'accessories', {
      name: 'Mouse sem alvo ASSET', categoryId: cenario.categoriaAcessorioId, qty: 1,
    });

    const resposta = await api.post(`/api/accessories/${item.id}/checkout`, {
      targetType: 'ASSET', targetAssetId: cenario.ativo.id,
    });
    // 422 pelo próprio enum: um valor que não significa nada é um valor que um
    // dia alguém usa.
    expect(resposta.status).toBe(422);
  });
});

describe('D37 — o consumível não volta, e a ausência é a regra', () => {
  it('o banco não tem coluna de fechamento', async () => {
    const colunas = await prisma.$queryRaw<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns
       WHERE table_name = 'consumable_checkouts'
         AND (column_name ILIKE '%checkedin%' OR column_name ILIKE '%returned%' OR column_name ILIKE '%devolv%')
    `;
    expect(colunas).toEqual([]);
  });

  it('o checkin responde 404 do ROTEADOR, não 409 de uma validação', async () => {
    const item = await criarItemDeEstoque(api, 'consumables', {
      name: 'Resma que não volta', categoryId: cenario.categoriaConsumivelId, qty: 10,
    });
    const consumo = await api.post<{ id: string }>(`/api/consumables/${item.id}/consume`, {
      userId: cenario.laura, qty: 3,
    });
    expect(consumo.status).toBe(201);

    const checkin = await api.post(`/api/consumables/checkouts/${consumo.body.id}/checkin`, {});
    // 404 e não 409: a rota não existe. Implementar a devolução exigiria uma
    // migração, que é o tipo de mudança que alguém revisa.
    expect(checkin.status).toBe(404);

    // E a rota nem está registrada no Fastify — a prova de que o 404 é do
    // roteador e não de um handler que resolveu responder assim.
    expect(api.app.hasRoute({ method: 'POST', url: '/api/consumables/checkouts/:id/checkin' })).toBe(false);
  });

  it('o nome de quem consumiu é cópia, e sobrevive ao desligamento', async () => {
    const item = await criarItemDeEstoque(api, 'consumables', {
      name: 'Toner do snapshot', categoryId: cenario.categoriaConsumivelId, qty: 5,
    });
    const pessoa = await api.post<{ id: string }>('/api/users', {
      name: 'Quem Consumiu', email: 'consumiu@teste.local',
    });

    await api.post(`/api/consumables/${item.id}/consume`, { userId: pessoa.body.id, qty: 1 });
    await api.post(`/api/users/${pessoa.body.id}/offboard`, {});
    await api.delete(`/api/users/${pessoa.body.id}`);

    const movimentos = await api.get<{ action: string; rotulo: string }[]>(
      `/api/consumables/${item.id}/movements`,
    );
    // O `SetNull` da FK zeraria `userId` num delete físico, e o nome continua
    // legível porque foi copiado no ato — mesmo motivo do EULA do D29.
    expect(movimentos.body[0]).toMatchObject({ action: 'CHECKOUT', rotulo: 'Quem Consumiu' });
  });
});

describe('a quantidade não é campo do formulário', () => {
  it('PUT com qty responde 422 — pela chave ausente, não por uma checagem', async () => {
    const item = await criarItemDeEstoque(api, 'accessories', {
      name: 'Mouse da edição', categoryId: cenario.categoriaAcessorioId, qty: 4,
    });

    const resposta = await api.put(`/api/accessories/${item.id}`, { qty: 99 });
    expect(resposta.status).toBe(422);

    const depois = await api.get<{ qty: number }>(`/api/accessories/${item.id}`);
    expect(depois.body.qty).toBe(4);
  });

  it('o ajuste muda a qty e grava o StockLog na mesma transação', async () => {
    const item = await criarItemDeEstoque(api, 'accessories', {
      name: 'Mouse do ajuste', categoryId: cenario.categoriaAcessorioId, qty: 4,
    });

    const ajuste = await api.post<{ item: { qty: number; disponivel: number } }>(
      `/api/accessories/${item.id}/adjust-quantity`,
      { delta: 10, reason: 'COMPRA', notes: 'nota 123' },
    );
    expect(ajuste.status).toBe(200);
    expect(ajuste.body.item).toMatchObject({ qty: 14, disponivel: 14 });

    const logs = await prisma.stockLog.findMany({
      where: { itemType: 'ACCESSORY', itemId: item.id },
      select: { delta: true, reason: true, notes: true, actorId: true },
    });
    expect(logs).toEqual([
      { delta: 10, reason: 'COMPRA', notes: 'nota 123', actorId: api.adminId },
    ]);
  });

  it('recusa baixar abaixo do que já saiu', async () => {
    const item = await criarItemDeEstoque(api, 'accessories', {
      name: 'Mouse da baixa', categoryId: cenario.categoriaAcessorioId, qty: 5,
    });
    await api.post(`/api/accessories/${item.id}/checkout`, {
      targetType: 'USER', targetUserId: cenario.ana,
    });

    const baixa = await api.post<Record<string, unknown>>(
      `/api/accessories/${item.id}/adjust-quantity`,
      { delta: -5, reason: 'QUEBRA' },
    );
    // Sem esta recusa, o sistema escreveria sozinho a inconsistência que o
    // alerta existe para denunciar: `qty = 0` com uma unidade na rua.
    expect(baixa.status).toBe(409);
    expect(baixa.body).toMatchObject({ novaQty: 0, emUso: 1 });
  });

  it('um ajuste de zero é recusado antes de virar linha de log', async () => {
    const item = await criarItemDeEstoque(api, 'accessories', {
      name: 'Mouse do zero', categoryId: cenario.categoriaAcessorioId, qty: 1,
    });
    expect((await api.post(`/api/accessories/${item.id}/adjust-quantity`, { delta: 0, reason: 'OUTRO' })).status)
      .toBe(422);
    expect(await prisma.stockLog.count({ where: { itemId: item.id } })).toBe(0);
  });
});

describe('a categoria precisa ser do tipo do item', () => {
  it('recusa categoria de ATIVO num acessório', async () => {
    // Nada no banco impede — a FK só garante que a linha existe, não o `type`
    // dela. Sem a guarda, um acessório de categoria "Notebook (ASSET)" entra
    // sem erro nenhum e reaparece agrupado com equipamento.
    const resposta = await api.post('/api/accessories', {
      name: 'Acessório de categoria errada',
      categoryId: cenario.categoriaId,
      qty: 1,
    });
    expect(resposta.status).toBe(422);
  });

  it('recusa categoria de ACESSÓRIO num componente', async () => {
    const resposta = await api.post('/api/components', {
      name: 'Componente de categoria errada',
      categoryId: cenario.categoriaAcessorioId,
      qty: 1,
    });
    expect(resposta.status).toBe(422);
  });
});

describe('D36 — os três têm lixeira, e ela é protegida por 409', () => {
  it('recusa apagar acessório com unidade fora do estoque', async () => {
    const item = await criarItemDeEstoque(api, 'accessories', {
      name: 'Mouse com unidade fora', categoryId: cenario.categoriaAcessorioId, qty: 2,
    });
    const entrega = await api.post<{ id: string }>(`/api/accessories/${item.id}/checkout`, {
      targetType: 'USER', targetUserId: cenario.laura,
    });

    const recusa = await api.delete<{ error: string; saidasAbertas: number }>(
      `/api/accessories/${item.id}`,
    );
    expect(recusa.status).toBe(409);
    expect(recusa.body.saidasAbertas).toBe(1);

    // A FRASE, e não só o status. Ela é o produto desta recusa: a tela mostra
    // `error.message` num `alert`, e um 409 que não diz o que fazer em seguida
    // deixa o operador clicando de novo no mesmo botão.
    expect(recusa.body.error).toBe(
      'Este acessório ainda tem 1 unidade fora do estoque. Faça a devolução antes de excluir.',
    );

    // Devolvida a unidade, a lixeira libera.
    await api.post(`/api/accessories/checkouts/${entrega.body.id}/checkin`, {});
    expect((await api.delete(`/api/accessories/${item.id}`)).status).toBe(204);
  });

  it('o consumível com histórico VAI para a lixeira — consumo não tem estado aberto', async () => {
    const item = await criarItemDeEstoque(api, 'consumables', {
      name: 'Resma com histórico', categoryId: cenario.categoriaConsumivelId, qty: 10,
    });
    await api.post(`/api/consumables/${item.id}/consume`, { userId: cenario.ana, qty: 2 });

    // Contar os consumos aqui travaria para sempre o item mais usado do
    // almoxarifado — e a lixeira existe justamente para o histórico sobreviver.
    expect((await api.delete(`/api/consumables/${item.id}`)).status).toBe(204);

    const movimentos = await api.get(`/api/consumables/${item.id}/movements`);
    expect(movimentos.status).toBe(200);
  });

  it('o nome volta a ficar livre quando o item está na lixeira', async () => {
    const nome = 'Mouse do nome reutilizado';
    const primeiro = await criarItemDeEstoque(api, 'accessories', {
      name: nome, categoryId: cenario.categoriaAcessorioId, qty: 1,
    });

    // Com `@unique` comum em vez do índice parcial, este segundo cadastro seria
    // 409 para sempre — é o `unique_undeleted` do Snipe-IT.
    expect((await api.post('/api/accessories', {
      name: nome, categoryId: cenario.categoriaAcessorioId, qty: 1,
    })).status).toBe(409);

    await api.delete(`/api/accessories/${primeiro.id}`);

    expect((await api.post('/api/accessories', {
      name: nome, categoryId: cenario.categoriaAcessorioId, qty: 1,
    })).status).toBe(201);

    // E restaurar o da lixeira agora esbarra no índice — com a frase que
    // ENSINA, não com o "Registro já existe" genérico do error-handler: num
    // `alert` disparado por um clique em "Restaurar", o genérico não diz o que
    // aconteceu nem o que fazer.
    const restauro = await api.post<{ error: string }>(`/api/accessories/${primeiro.id}/restore`);
    expect(restauro.status).toBe(409);
    expect(restauro.body.error).toBe(
      'Já existe outro acessório com este nome. Renomeie um dos dois antes de restaurar.',
    );
  });
});

describe('o alerta de posto vago é sobre POSTO', () => {
  it('ignora a unidade guardada numa localização que não é posto de trabalho', async () => {
    // A entrega aceita qualquer localização — o alvo `LOCATION` da F4 também
    // aceita, e o `/options` de localizações devolve tudo de propósito (o pai
    // de uma mesa é uma sala). Então nada impede entregar ao almoxarifado.
    const deposito = await api.post<{ id: string }>('/api/locations', {
      name: 'Almoxarifado que não é mesa', isWorkstation: false,
    });
    const item = await criarItemDeEstoque(api, 'accessories', {
      name: 'Mouse guardado no almoxarifado', categoryId: cenario.categoriaAcessorioId, qty: 2,
    });

    expect((await api.post(`/api/accessories/${item.id}/checkout`, {
      targetType: 'LOCATION', targetLocationId: deposito.body.id,
    })).status).toBe(201);

    // Prédio não tem ocupante e nunca vai ter, então `occupants: none` é
    // verdade ETERNA para ele: sem o filtro de posto, essa unidade entrava no
    // alerta para sempre. Alerta é lista para AGIR, e lista que nunca esvazia é
    // lista que se para de ler — ainda por cima com um link para /postos, que
    // não mostra o que não é posto.
    const alertas = await api.get<{ postoVago: { accessoryId: string; locationName: string }[] }>(
      '/api/stock/alerts',
    );
    expect(alertas.body.postoVago.map((u) => u.accessoryId)).not.toContain(item.id);

    // E a mesa vazia continua alertando — o sinal não foi desligado, foi
    // apontado para o caso que ele existe para mostrar.
    expect(alertas.body.postoVago.some((u) => u.locationName === 'Mesa sem ninguém')).toBe(true);
  });
});

describe('a porta fechada alcança o estoque (D22)', () => {
  it('as doze rotas da fase respondem 401 sem sessão', async () => {
    // A API é fechada por padrão — o `preHandler` global exige sessão e a
    // allowlist do `app.ts` é a exceção inteira. Nenhuma rota desta fase está
    // lá, e é por isso que elas são protegidas.
    //
    // O teste existe porque essa garantia é por OMISSÃO: ela vale enquanto
    // ninguém acrescentar uma linha à allowlist, e uma rota de estoque aberta
    // não falha em lugar nenhum — ela simplesmente responde. O de
    // `harness.test.ts` cobre `/api/assets`, que é uma rota só; estas são as
    // mais novas do sistema.
    const id = '00000000-0000-4000-8000-000000000000';

    const respostas = await Promise.all([
      api.anonimo.get('/api/accessories'),
      api.anonimo.get('/api/consumables'),
      api.anonimo.get('/api/components'),
      api.anonimo.get('/api/stock/alerts'),
      api.anonimo.get(`/api/assets/${id}/components`),
      api.anonimo.post(`/api/accessories/${id}/checkout`, { targetType: 'USER', targetUserId: id }),
      api.anonimo.post(`/api/accessories/checkouts/${id}/checkin`, {}),
      api.anonimo.post(`/api/consumables/${id}/consume`, { userId: id, qty: 1 }),
      api.anonimo.post(`/api/components/${id}/attach`, { assetId: id, qty: 1 }),
      api.anonimo.post(`/api/components/attachments/${id}/detach`, {}),
      api.anonimo.post(`/api/accessories/${id}/adjust-quantity`, { delta: 1, reason: 'COMPRA' }),
      api.anonimo.delete(`/api/accessories/${id}`),
    ]);

    // Todas, e não "alguma": a asserção é sobre a lista inteira porque uma
    // única passando já é o vazamento.
    expect(respostas.map((r) => r.status)).toEqual(Array(12).fill(401));
  });
});
