import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import {
  cenarioDePosse, comporConjunto, criarAtivo, criarCampo, criarConjunto, pendurarConjunto,
} from '../helpers/fixtures';
import { prisma } from '../../server/core/database/prismaClient';

// D63 — FILTRAR POR CAMPO CUSTOMIZADO: SIM. ORDENAR: NÃO, NESTA FASE.
//
// ═════════════════════════════════════════════════════════════════════════════
// A CHAVE CHEGA LITERAL, COM OS COLCHETES.
//
// O parser de query do Fastify é plano — ele não interpreta `[...]` como
// aninhamento —, então `?cf[ip_fixo]=10.0.0.7` vira a chave `"cf[ip_fixo]"`. É
// isso que permite ler o filtro sem trocar o parser, e é o que estes testes
// fixam: se alguém instalar um parser que aninhe, eles quebram aqui em vez de o
// filtro passar a ser ignorado em silêncio.
// ═════════════════════════════════════════════════════════════════════════════

let api: ApiDeTeste;
let cenario: Awaited<ReturnType<typeof cenarioDePosse>>;
let ip = { id: '', slug: '' };
let ram = { id: '', slug: '' };
let ativoDoIp = '';

beforeAll(async () => {
  api = await criarApi();
  cenario = await cenarioDePosse(api);

  ip = await criarCampo(api, { name: 'IP Fixo', format: 'IPV4', showInListView: true });
  ram = await criarCampo(api, { name: 'RAM GB', format: 'NUMERIC' });

  const conjunto = await criarConjunto(api, 'Conjunto do filtro');
  await comporConjunto(api, conjunto, [{ fieldId: ip.id }, { fieldId: ram.id }]);
  await pendurarConjunto(api, { modelId: cenario.modelId }, conjunto);

  // Três ativos: dois com IP, um deles com RAM, e um sem campo nenhum.
  const a = await criarAtivo(api, {
    statusId: cenario.statusDeployableId, modelId: cenario.modelId, name: 'Com IP 7',
  });
  const b = await criarAtivo(api, {
    statusId: cenario.statusDeployableId, modelId: cenario.modelId, name: 'Com IP 8',
  });
  await criarAtivo(api, {
    statusId: cenario.statusDeployableId, modelId: cenario.modelId, name: 'Sem campo',
  });

  ativoDoIp = a.id;
  await api.put(`/api/assets/${a.id}`, { customFields: { ip_fixo: '10.0.0.7', ram_gb: '16' } });
  await api.put(`/api/assets/${b.id}`, { customFields: { ip_fixo: '10.0.0.8' } });
});

afterAll(async () => {
  await api.fechar();
});

describe('igualdade dentro do JsonB', () => {
  it('filtra pela chave literal `cf[slug]`', async () => {
    const { status, body } = await api.get<{ total: number; rows: { id: string }[] }>(
      '/api/assets?cf%5Bip_fixo%5D=10.0.0.7',
    );
    expect(status).toBe(200);
    expect(body.total).toBe(1);
    expect(body.rows[0].id).toBe(ativoDoIp);
  });

  it('o `total` do envelope descreve o conjunto FILTRADO, não a tabela', async () => {
    // Filtrar no cliente faria a página 1 mostrar 1 de 25 linhas e o `total`
    // mentir — a paginação inteira passaria a descrever um conjunto que a tela
    // não está vendo. É a mesma regra do `POSTO_VAGO`.
    const filtrado = await api.get<{ total: number }>('/api/assets?cf%5Bip_fixo%5D=10.0.0.7');
    const tudo = await api.get<{ total: number }>('/api/assets');
    expect(filtrado.body.total).toBe(1);
    expect(tudo.body.total).toBeGreaterThan(1);
  });

  it('DOIS filtros se somam com AND, e o segundo não sobrescreve o primeiro', async () => {
    // Espalhados num objeto só, duas chaves `customFields` se sobrescreveriam e
    // só o último filtro valeria — em silêncio.
    const casam = await api.get<{ total: number }>(
      '/api/assets?cf%5Bip_fixo%5D=10.0.0.7&cf%5Bram_gb%5D=16',
    );
    expect(casam.body.total).toBe(1);

    const naoCasam = await api.get<{ total: number }>(
      '/api/assets?cf%5Bip_fixo%5D=10.0.0.8&cf%5Bram_gb%5D=16',
    );
    expect(naoCasam.body.total).toBe(0);
  });

  it('compõe com a busca textual e com o filtro por status', async () => {
    const { body } = await api.get<{ total: number }>(
      `/api/assets?cf%5Bip_fixo%5D=10.0.0.7&q=Com%20IP&statusId=${cenario.statusDeployableId}`,
    );
    expect(body.total).toBe(1);
  });

  it('valor que ninguém tem devolve zero, não a tabela inteira', async () => {
    const { body } = await api.get<{ total: number }>('/api/assets?cf%5Bip_fixo%5D=192.168.0.1');
    expect(body.total).toBe(0);
  });

  it('valor VAZIO não filtra nada — não é "ache quem tem string vazia"', async () => {
    // Limpar um campo REMOVE a chave, então "valor vazio" é um estado que não
    // existe no JsonB. Tratá-lo como filtro devolveria zero para sempre.
    const comVazio = await api.get<{ total: number }>('/api/assets?cf%5Bip_fixo%5D=');
    const semNada = await api.get<{ total: number }>('/api/assets');
    expect(comVazio.body.total).toBe(semNada.body.total);
  });
});

describe('o que o filtro RECUSA', () => {
  it('chave `cf[...]` fora do formato de slug cai no 422 do parser estrito', async () => {
    // Ela não é lida como filtro e segue para o `parseListQuery`, que recusa o
    // que não conhece. A mensagem sai de graça, sem código nenhum.
    const { status, body } = await api.get<{ fields: Record<string, string> }>(
      '/api/assets?cf%5BFoo%5D=x',
    );
    expect(status).toBe(422);
    expect(JSON.stringify(body)).toMatch(/cf\[Foo\]/);
  });

  it('recusa a MESMA chave repetida, em vez de ignorá-la em silêncio', async () => {
    // ═════════════════════════════════════════════════════════════════════════
    // O FURO QUE ISTO FECHA.
    //
    // Chave repetida faz o parser de query entregar um ARRAY. Descartá-la em
    // silêncio devolveria a lista INTEIRA, sem filtro nenhum, para uma URL que
    // pediu dois filtros — a tela mostraria resultado, só não o pedido. É a
    // falha muda que o `strictObject` existe para evitar, e pior: com aparência
    // de sucesso.
    // ═════════════════════════════════════════════════════════════════════════
    const { status, body } = await api.get<{ error: string }>(
      '/api/assets?cf%5Bip_fixo%5D=10.0.0.7&cf%5Bip_fixo%5D=10.0.0.8',
    );
    expect(status).toBe(422);
    expect(body.error).toMatch(/mais de uma vez/);
  });

  it('recusa valor longo demais', async () => {
    const { status } = await api.get(`/api/assets?cf%5Bip_fixo%5D=${'a'.repeat(300)}`);
    expect(status).toBe(422);
  });

  it('recusa mais filtros do que o teto', async () => {
    // Cada um é uma varredura a mais da coluna JsonB: sem teto, seis chaves numa
    // URL é uma consulta caríssima escrita à mão.
    const muitos = ['a', 'b', 'c', 'd', 'e', 'f']
      .map((letra) => `cf%5Bcampo_${letra}%5D=1`)
      .join('&');
    const { status, body } = await api.get<{ error: string }>(`/api/assets?${muitos}`);
    expect(status).toBe(422);
    expect(body.error).toMatch(/Máximo de 5 filtros/);
  });

  it('ORDENAR por campo customizado NÃO existe nesta fase (D63)', async () => {
    // O GIN não serve `ORDER BY customFields->>'x'`, e um índice B-tree de
    // expressão por campo seria DDL por campo — exatamente o que o D7 recusou,
    // entrando pela porta dos fundos.
    //
    // A recusa é o `ASSET_SORTABLE`, e a mensagem LISTA o que dá para ordenar.
    const { status, body } = await api.get<{ fields: Record<string, string> }>(
      '/api/assets?sort=cf.ram_gb',
    );
    expect(status).toBe(422);
    expect(body.fields.sort).toMatch(/ordenação inválida/);
    expect(body.fields.sort).toMatch(/assetTag/);
  });
});

describe('o índice GIN e o que ele serve — o número que a F10 herda', () => {
  it('o índice existe, é GIN e usa `jsonb_ops`', async () => {
    const indices = await prisma.$queryRaw<{ indexname: string; indexdef: string }[]>`
      SELECT indexname, indexdef FROM pg_indexes
       WHERE tablename = 'assets' AND indexdef ILIKE '%gin%'
    `;
    expect(indices).toHaveLength(1);
    expect(indices[0].indexname).toBe('assets_customFields_idx');
    // `jsonb_path_ops` é menor e mais rápido para `@>`, e NÃO suporta o operador
    // `?` (existência de chave) — que é a primeira pergunta da tela de
    // administração e a base do `countUsages` de um campo. Paga-se o tamanho do
    // índice pela pergunta.
    expect(indices[0].indexdef.toLowerCase()).not.toContain('jsonb_path_ops');
  });

  it('`@>` e `?` usam o índice; o `#>` que o Prisma emite NÃO usa', async () => {
    // ═════════════════════════════════════════════════════════════════════════
    // ESTE TESTE FIXA A CORREÇÃO DE FATO DO D63.
    //
    // O plano dizia que o filtro `?cf[slug]=valor`, traduzido para
    // `customFields: { path, equals }`, usaria o índice. NÃO USA: o Prisma tipado
    // emite `("customFields" #> ARRAY['x'])::jsonb = $1`, comparação de
    // EXPRESSÃO, que nenhum GIN serve.
    //
    // As perguntas de tabela inteira — que não precisam compor com vista, busca e
    // paginação — descem para `$queryRaw` e usam o índice
    // (`count-assets-with-field.usecase.ts`). O filtro da listagem paga a
    // varredura, e é ESTE o número que a F10 herda.
    //
    // Com poucas linhas o planejador escolhe Seq Scan para tudo, então o que se
    // afirma aqui é o que não depende de volume: a FORMA do plano que cada
    // operador admite. `EXPLAIN` sem `ANALYZE` para não medir tempo de máquina de
    // CI.
    // ═════════════════════════════════════════════════════════════════════════
    const planoDoContains = await prisma.$queryRaw<{ 'QUERY PLAN': string }[]>`
      EXPLAIN SELECT id FROM "assets" WHERE "customFields" @> '{"ip_fixo":"10.0.0.7"}'::jsonb
    `;
    // O operador é reconhecido como condição indexável — ele aparece no plano
    // como `@>`, não embrulhado numa expressão sobre a coluna.
    expect(JSON.stringify(planoDoContains)).toContain('@>');

    const planoDaOrdenacao = await prisma.$queryRaw<{ 'QUERY PLAN': string }[]>`
      EXPLAIN SELECT id FROM "assets" ORDER BY "customFields"->>'ram_gb' LIMIT 25
    `;
    // Ordenação é SEMPRE Sort, com ou sem volume: nenhum índice a serve. É a
    // afirmação inteira do D63.
    expect(JSON.stringify(planoDaOrdenacao)).toContain('Sort');
  });
});

describe('os campos que viram COLUNA da listagem', () => {
  it('a rota devolve só os de `showInListView`', async () => {
    const { body } = await api.get<{ slug: string; name: string }[]>('/api/custom-fields/list-view');
    expect(body.map((campo) => campo.slug)).toEqual(['ip_fixo']);
  });

  it('a listagem de ativos entrega os valores para a coluna', async () => {
    const { body } = await api.get<{ rows: { id: string; customFields: Record<string, string> | null }[] }>(
      '/api/assets?perPage=100',
    );
    const linha = body.rows.find((row) => row.id === ativoDoIp)!;
    expect(linha.customFields!.ip_fixo).toBe('10.0.0.7');

    // O ativo sem campo nenhum vem com `null`, não com `{}`: é o contrato da
    // coluna, e é o que faz `customFields IS NULL` continuar honesto.
    const semCampo = body.rows.find((row) => row.customFields === null);
    expect(semCampo).toBeDefined();
  });
});

describe('DbNull × JsonNull — a armadilha mais barata de cair', () => {
  it('ativo sem campo nenhum grava a COLUNA nula, não o literal JSON `null`', async () => {
    const ativo = await criarAtivo(api, {
      statusId: cenario.statusDeployableId, modelId: cenario.modelId, name: 'Nunca teve campo',
    });

    // Com `JsonNull`, `customFields IS NULL` pararia de achá-lo e a contagem de
    // "sem campos preenchidos" passaria a mentir, em silêncio.
    const nulos = await prisma.$queryRaw<{ total: bigint }[]>`
      SELECT count(*)::bigint AS total FROM "assets" WHERE id = ${ativo.id}::uuid AND "customFields" IS NULL
    `;
    expect(Number(nulos[0].total)).toBe(1);

    // E nenhuma linha da tabela tem o literal `null` dentro da coluna.
    const literais = await prisma.$queryRaw<{ total: bigint }[]>`
      SELECT count(*)::bigint AS total FROM "assets" WHERE "customFields" = 'null'::jsonb
    `;
    expect(Number(literais[0].total)).toBe(0);
  });

  it('limpar o ÚLTIMO campo volta a coluna para nula', async () => {
    const ativo = await criarAtivo(api, {
      statusId: cenario.statusDeployableId, modelId: cenario.modelId, name: 'Enche e esvazia',
    });
    await api.put(`/api/assets/${ativo.id}`, { customFields: { ip_fixo: '10.0.0.9' } });
    await api.put(`/api/assets/${ativo.id}`, { customFields: { ip_fixo: '' } });

    const nulos = await prisma.$queryRaw<{ total: bigint }[]>`
      SELECT count(*)::bigint AS total FROM "assets" WHERE id = ${ativo.id}::uuid AND "customFields" IS NULL
    `;
    expect(Number(nulos[0].total)).toBe(1);
  });

  it('limpar UM de dois campos REMOVE a chave, não grava `null` nela', async () => {
    // Um `{"ip_fixo": null}` gravado faria `customFields ? 'ip_fixo'` continuar
    // verdadeiro — e a contagem de "quantos ativos têm este campo preenchido"
    // passaria a contar quem apagou o valor.
    const ativo = await criarAtivo(api, {
      statusId: cenario.statusDeployableId, modelId: cenario.modelId, name: 'Limpa um de dois',
    });
    await api.put(`/api/assets/${ativo.id}`, {
      customFields: { ip_fixo: '10.0.0.10', ram_gb: '32' },
    });
    await api.put(`/api/assets/${ativo.id}`, { customFields: { ip_fixo: '' } });

    const linha = await prisma.asset.findUniqueOrThrow({
      where: { id: ativo.id }, select: { customFields: true },
    });
    expect(linha.customFields).toEqual({ ram_gb: '32' });

    const temChave = await prisma.$queryRaw<{ total: bigint }[]>`
      SELECT count(*)::bigint AS total
        FROM "assets" WHERE id = ${ativo.id}::uuid AND "customFields" ? 'ip_fixo'
    `;
    expect(Number(temChave[0].total)).toBe(0);
  });
});
