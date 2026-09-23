import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import {
  criarAtivo, criarFabricante, criarItemDeEstoque, criarModelo, idsDoSeed,
} from '../helpers/fixtures';
import { prisma } from '../../server/core/database/prismaClient';

// INVARIANTE 3 — o tipo de um status em uso não muda (`docs/INVARIANTES.md`).
//
// É a única das quatro que mora inteiramente na APLICAÇÃO, e a razão está na
// forma da regra: "mudou de X para Y **e** há quem aponte". Precisa do valor
// anterior e de um `COUNT` em outra tabela — nem índice nem CHECK fazem isso.
//
// O que ela impede é uma escrita que não deixa rastro: trocar o `type` de um
// `StatusLabel` que 200 ativos usam muda o significado dos 200 DE UMA VEZ, sem
// escrever uma linha em `assets` e portanto sem `ActivityLog` nenhum.
// "Pronto p/ Uso" virando `ARCHIVED` arquiva a frota em silêncio.

let api: ApiDeTeste;
let modelId = '';
let categoriaId = '';

beforeAll(async () => {
  api = await criarApi();
  const seed = await idsDoSeed();
  categoriaId = seed.categoriaId;
  const fabricanteId = await criarFabricante(api);
  modelId = await criarModelo(api, { categoriaId, fabricanteId });
});

afterAll(async () => {
  await api.fechar();
});

describe('StatusLabel', () => {
  it('deixa mudar o tipo enquanto NINGUÉM usa', async () => {
    const criado = await api.post<{ id: string }>('/api/status-labels', {
      name: 'Status sem uso',
      type: 'DEPLOYABLE',
    });
    expect(criado.status).toBe(201);

    const { status } = await api.put(`/api/status-labels/${criado.body.id}`, { type: 'ARCHIVED' });
    expect(status).toBe(200);
  });

  it('recusa mudar o tipo de um status EM USO, dizendo quantos', async () => {
    const criado = await api.post<{ id: string }>('/api/status-labels', {
      name: 'Status em uso',
      type: 'DEPLOYABLE',
    });
    await criarAtivo(api, { statusId: criado.body.id, modelId, name: 'Ativo que segura o status' });

    const { status, body } = await api.put<{ error: string }>(`/api/status-labels/${criado.body.id}`, {
      type: 'ARCHIVED',
    });

    expect(status).toBe(409);
    // O 409 genérico do banco não diria QUANTOS — e o número é o que faz o
    // operador entender o tamanho do estrago que acabou de ser evitado.
    expect(body.error).toMatch(/1/);
  });

  it('deixa renomear um status em uso — só o TIPO é que trava', async () => {
    // A recusa é estreita de propósito: mudar a cor, o nome ou as notas de um
    // status em uso é edição normal e não muda o significado de ativo nenhum.
    const criado = await api.post<{ id: string }>('/api/status-labels', {
      name: 'Status renomeável',
      type: 'DEPLOYABLE',
    });
    await criarAtivo(api, { statusId: criado.body.id, modelId, name: 'Ativo do rename' });

    const { status } = await api.put(`/api/status-labels/${criado.body.id}`, { name: 'Nome novo' });
    expect(status).toBe(200);
  });
});

describe('Category', () => {
  it('recusa mudar o tipo de uma categoria em uso', async () => {
    // Mais grave que o status: o tipo da categoria diz a que MÓDULO o registro
    // pertence. Um modelo de ativo pendurado numa categoria que virou LICENSE
    // sai do inventário sem nada ter sido apagado.
    const { status, body } = await api.put<{ error: string }>(`/api/categories/${categoriaId}`, {
      type: 'LICENSE',
    });

    expect(status).toBe(409);
    expect(body.error).toMatch(/\d/);
  });
});

describe('o catálogo não tem lixeira (D8) — a proteção é o 409 por uso', () => {
  it('recusa apagar um fabricante que tem modelo', async () => {
    const { status, body } = await api.delete<{ error: string }>(
      `/api/manufacturers/${(await api.get<{ rows: { id: string }[] }>('/api/manufacturers')).body.rows[0].id}`,
    );

    expect(status).toBe(409);
    expect(body.error).toMatch(/\d/);
  });

  it('não expõe rota de restauração no catálogo', async () => {
    // Não há lixeira, então não há o que restaurar. A rota existir seria a
    // promessa de uma lixeira que não existe.
    const { status } = await api.post('/api/manufacturers/00000000-0000-4000-8000-000000000000/restore');
    expect(status).toBe(404);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// O CATÁLOGO E O ESTOQUE (F5) — o furo que a fase abriu e o que ele custava.
//
// `Accessory`, `Consumable` e `Component` apontam DIRETO para categoria,
// fabricante, fornecedor e localização, e as quatro FKs são `Restrict`. Nenhum
// `countUsages` sabia deles, e isso rendia duas coisas diferentes:
//
//   no DELETE   o `count` dava 0, o delete seguia, e o Postgres recusava com
//               P2003 — 409 "Registro está em uso por outro cadastro", sem
//               dizer por quantos nem por quê. Feio, mas o dado sobrevivia.
//
//   no beforeWrite   o tipo de uma categoria usada SÓ por acessórios passava de
//               `ACCESSORY` para `ASSET` sem recusa nenhuma. O acessório
//               terminava numa categoria de tipo `ASSET` — exatamente o estado
//               que `assert-stock-references.usecase.ts` recusa com 422 na
//               criação. A guarda existia na porta do ITEM; a da CATEGORIA
//               estava aberta, e por ela o dado ficava errado de verdade.
// ───────────────────────────────────────────────────────────────────────────

describe('o catálogo conhece as tabelas de estoque', () => {
  it('recusa mudar o tipo de uma categoria usada SÓ por acessório', async () => {
    const seed = await idsDoSeed();
    const categoria = await api.post<{ id: string }>('/api/categories', {
      name: 'Categoria de acessório que não vira ativo', type: 'ACCESSORY', color: '#14b8a6',
    });
    expect(categoria.status).toBe(201);

    await criarItemDeEstoque(api, 'accessories', {
      name: 'Mouse que segura a categoria', categoryId: categoria.body.id, qty: 1,
    });

    const troca = await api.put<{ error: string }>(`/api/categories/${categoria.body.id}`, {
      type: 'ASSET',
    });
    expect(troca.status).toBe(409);
    expect(troca.body.error).toMatch(/1 registro/);

    // E o acessório continua numa categoria do tipo dele. Esta asserção é a que
    // importa: o 409 é o meio, o estado do dado é o fim.
    const item = await prisma.accessory.findFirstOrThrow({
      where: { categoryId: categoria.body.id },
      select: { category: { select: { type: true } } },
    });
    expect(item.category.type).toBe('ACCESSORY');

    // O seed continua com uma categoria de cada tipo — a de ASSET não foi tocada.
    expect(seed.categoriaAcessorioId).not.toBe(categoria.body.id);
  });

  it('o DELETE diz QUANTOS, em vez do 409 genérico do banco', async () => {
    const seed = await idsDoSeed();

    const categoria = await api.post<{ id: string }>('/api/categories', {
      name: 'Categoria de consumível em uso', type: 'CONSUMABLE', color: '#a855f7',
    });
    const fabricante = await api.post<{ id: string }>('/api/manufacturers', { name: 'Fabricante de estoque' });
    const fornecedor = await api.post<{ id: string }>('/api/suppliers', { name: 'Fornecedor de estoque' });
    const local = await api.post<{ id: string }>('/api/locations', { name: 'Almoxarifado do teste' });

    const criado = await api.post('/api/consumables', {
      name: 'Resma que segura o catálogo inteiro',
      categoryId: categoria.body.id,
      qty: 5,
      manufacturerId: fabricante.body.id,
      supplierId: fornecedor.body.id,
      locationId: local.body.id,
    });
    expect(criado.status).toBe(201);

    for (const [rota, id] of [
      ['categories', categoria.body.id],
      ['manufacturers', fabricante.body.id],
      ['suppliers', fornecedor.body.id],
      ['locations', local.body.id],
    ] as const) {
      const recusa = await api.delete<{ error: string; emUso: number }>(`/api/${rota}/${id}`);
      expect(recusa.status).toBe(409);
      // A FRASE, e não só o status: o genérico do P2003 não diz por quantos, e
      // o número é o que faz o operador entender o que precisa mexer antes.
      expect(recusa.body.error).toMatch(/em uso por 1 registro/);
      expect(recusa.body.emUso).toBe(1);
    }

    expect(seed.categoriaConsumivelId).not.toBe(categoria.body.id);
  });

  it('a localização com unidade entregue ao posto também conta', async () => {
    const seed = await idsDoSeed();
    const posto = await api.post<{ id: string }>('/api/locations', {
      name: 'Mesa que recebeu mouse', isWorkstation: true,
    });
    const item = await criarItemDeEstoque(api, 'accessories', {
      name: 'Mouse entregue à mesa do catálogo', categoryId: seed.categoriaAcessorioId, qty: 2,
    });

    const entrega = await api.post<{ id: string }>(`/api/accessories/${item.id}/checkout`, {
      targetType: 'LOCATION', targetLocationId: posto.body.id,
    });
    expect(entrega.status).toBe(201);

    const recusa = await api.delete<{ error: string }>(`/api/locations/${posto.body.id}`);
    expect(recusa.status).toBe(409);
    expect(recusa.body.error).toMatch(/em uso por 1 registro/);

    // E DEPOIS DE DEVOLVIDA continua recusando: `targetLocationId` é `Restrict`,
    // então a entrega fechada segue segurando o posto no banco. Contar só as
    // abertas daria a mesma promessa falsa que não contar nenhuma — e apagar a
    // Mesa 1 apagaria de onde o mouse esteve.
    await api.post(`/api/accessories/checkouts/${entrega.body.id}/checkin`, {});
    expect((await api.delete(`/api/locations/${posto.body.id}`)).status).toBe(409);
  });
});
