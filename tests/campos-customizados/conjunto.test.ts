import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import {
  cenarioDePosse, comporConjunto, criarAtivo, criarCampo, criarConjunto, criarFabricante,
  criarModelo, pendurarConjunto,
} from '../helpers/fixtures';
import { prisma } from '../../server/core/database/prismaClient';

// A RESOLUÇÃO DO CONJUNTO (D58), OS ÓRFÃOS (D60) E A OBRIGATORIEDADE (D61).
//
// As três moram juntas porque as três dependem da MESMA linha:
//
//   fieldset = model.customFieldsetId ?? model.category.customFieldsetId
//
// Trocar o modelo de um ativo pode trocar o conjunto dele. O que acontece com os
// valores do conjunto anterior é a pergunta que o D60 responde, e o que acontece
// com os obrigatórios do conjunto novo é a que o D61 responde.

let api: ApiDeTeste;
let cenario: Awaited<ReturnType<typeof cenarioDePosse>>;

/** O conjunto da CATEGORIA (o padrão) e o do MODELO (que sobrepõe). */
let campoDaCategoria: { id: string; slug: string };
let campoDoModelo: { id: string; slug: string };
let conjuntoDaCategoria: string;
let conjuntoDoModelo: string;

beforeAll(async () => {
  api = await criarApi();
  cenario = await cenarioDePosse(api);

  campoDaCategoria = await criarCampo(api, { name: 'Patrimonio Contabil' });
  campoDoModelo = await criarCampo(api, { name: 'IMEI' });

  conjuntoDaCategoria = await criarConjunto(api, 'Notebooks — padrão da categoria');
  conjuntoDoModelo = await criarConjunto(api, 'Tablet 4G — só deste modelo');

  await comporConjunto(api, conjuntoDaCategoria, [{ fieldId: campoDaCategoria.id }]);
  await comporConjunto(api, conjuntoDoModelo, [{ fieldId: campoDoModelo.id }]);
});

afterAll(async () => {
  await api.fechar();
});

describe('D58 — o modelo sobrepõe a categoria', () => {
  it('sem âncora nenhuma, o conjunto resolvido é vazio', async () => {
    const { body } = await api.get<{ fieldsetId: string | null; origem: string | null; campos: unknown[] }>(
      `/api/assets/fieldset?modelId=${cenario.modelId}`,
    );
    expect(body).toMatchObject({ fieldsetId: null, origem: null });
    expect(body.campos).toHaveLength(0);
  });

  it('com conjunto na CATEGORIA, ele vale e a origem diz de onde veio', async () => {
    await pendurarConjunto(api, { categoriaId: cenario.categoriaId }, conjuntoDaCategoria);

    const { body } = await api.get<{ origem: string; campos: { slug: string }[] }>(
      `/api/assets/fieldset?modelId=${cenario.modelId}`,
    );
    expect(body.origem).toBe('CATEGORY');
    expect(body.campos.map((campo) => campo.slug)).toEqual(['patrimonio_contabil']);
  });

  it('com conjunto no MODELO, ele VENCE o da categoria', async () => {
    // A categoria continua com o dela — e o modelo sobrepõe, sem apagar nada.
    await pendurarConjunto(api, { modelId: cenario.modelId }, conjuntoDoModelo);

    const { body } = await api.get<{ origem: string; campos: { slug: string }[] }>(
      `/api/assets/fieldset?modelId=${cenario.modelId}`,
    );
    expect(body.origem).toBe('MODEL');
    expect(body.campos.map((campo) => campo.slug)).toEqual(['imei']);

    // Tirar o do modelo faz o da categoria voltar a valer: a precedência é
    // resolvida na LEITURA, não gravada em lugar nenhum.
    await pendurarConjunto(api, { modelId: cenario.modelId }, null);
    const volta = await api.get<{ origem: string }>(`/api/assets/fieldset?modelId=${cenario.modelId}`);
    expect(volta.body.origem).toBe('CATEGORY');
  });

  it('a resolução parte do MODELO — `Asset` não tem categoryId', async () => {
    // Não existe rota `?assetId=`: o formulário precisa dos campos no instante em
    // que o modelo é escolhido, antes de o ativo existir.
    const { status } = await api.get(`/api/assets/fieldset?assetId=${cenario.ativo.id}`);
    expect(status).toBe(422);
  });
});

describe('a validação de conteúdo, contra o conjunto resolvido', () => {
  it('grava o valor e devolve na leitura', async () => {
    const ativo = await criarAtivo(api, {
      statusId: cenario.statusDeployableId, modelId: cenario.modelId, name: 'Ativo A',
    });

    const gravou = await api.put<{ customFields: Record<string, string> }>(`/api/assets/${ativo.id}`, {
      customFields: { patrimonio_contabil: 'PAT-0001' },
    });
    expect(gravou.status).toBe(200);
    expect(gravou.body.customFields).toEqual({ patrimonio_contabil: 'PAT-0001' });

    const lido = await api.get<{ customFields: Record<string, string> }>(`/api/assets/${ativo.id}`);
    expect(lido.body.customFields).toEqual({ patrimonio_contabil: 'PAT-0001' });
  });

  it('recusa chave que não faz parte do conjunto do modelo', async () => {
    // É o `strictObject` da borda aplicado ao conjunto resolvido: sem isto, uma
    // chave desconhecida gravaria e ficaria invisível em toda tela e imune a toda
    // validação — mass assignment dentro de uma coluna Json.
    const ativo = await criarAtivo(api, {
      statusId: cenario.statusDeployableId, modelId: cenario.modelId, name: 'Ativo B',
    });

    const { status, body } = await api.put<{ error: string; fields: Record<string, string> }>(
      `/api/assets/${ativo.id}`, { customFields: { senha_admin: 'x' } },
    );
    expect(status).toBe(422);
    expect(body.fields.senha_admin).toBeDefined();
    // A mensagem diz QUAL conjunto está em vigor, que é o que falta para
    // entender por que a chave não serve.
    expect(body.error).toMatch(/Notebooks — padrão da categoria/);
  });

  it('o 422 de formato leva o SLUG no caminho, para a tela pintar o input', async () => {
    const campoIp = await criarCampo(api, { name: 'IP Fixo', format: 'IPV4' });
    const conjunto = await criarConjunto(api, 'Conjunto do IP');
    await comporConjunto(api, conjunto, [{ fieldId: campoIp.id }]);

    const fabricanteId = await criarFabricante(api, 'Fabricante do IP');
    const modelId = await criarModelo(api, {
      categoriaId: cenario.categoriaId, fabricanteId, name: 'Modelo do IP',
    });
    await pendurarConjunto(api, { modelId }, conjunto);

    const { status, body } = await api.post<{ fields: Record<string, string> }>('/api/assets', {
      statusId: cenario.statusDeployableId, modelId, customFields: { ip_fixo: '999.1.1.1' },
    });

    expect(status).toBe(422);
    expect(body.fields.ip_fixo).toMatch(/IPv4/);
  });
});

describe('D60 — trocar o modelo NÃO apaga as chaves do conjunto anterior', () => {
  it('mantém o valor órfão intacto, e ele não aparece no conjunto resolvido', async () => {
    const ativo = await criarAtivo(api, {
      statusId: cenario.statusDeployableId, modelId: cenario.modelId, name: 'Ativo que troca de modelo',
    });
    await api.put(`/api/assets/${ativo.id}`, { customFields: { patrimonio_contabil: 'PAT-9999' } });

    // Um modelo de OUTRA categoria, com conjunto próprio e campo diferente.
    const fabricanteId = await criarFabricante(api, 'Fabricante do tablet');
    const outroModelo = await criarModelo(api, {
      categoriaId: cenario.categoriaId, fabricanteId, name: 'Tablet 4G',
    });
    await pendurarConjunto(api, { modelId: outroModelo }, conjuntoDoModelo);

    const trocou = await api.put<{ customFields: Record<string, string> }>(`/api/assets/${ativo.id}`, {
      modelId: outroModelo,
    });
    expect(trocou.status).toBe(200);

    // A CHAVE CONTINUA LÁ. Apagar dado do cliente porque um `<select>` mudou é a
    // "limpeza" que ninguém pede e todos lamentam — e o conjunto antigo pode
    // voltar.
    expect(trocou.body.customFields).toEqual({ patrimonio_contabil: 'PAT-9999' });

    const linha = await prisma.asset.findUniqueOrThrow({
      where: { id: ativo.id }, select: { customFields: true },
    });
    expect(linha.customFields).toEqual({ patrimonio_contabil: 'PAT-9999' });

    // E o conjunto resolvido do modelo novo NÃO a inclui: a tela não a oferece
    // para edição, e a validação a ignora.
    const conjunto = await api.get<{ campos: { slug: string }[] }>(
      `/api/assets/fieldset?modelId=${outroModelo}`,
    );
    expect(conjunto.body.campos.map((campo) => campo.slug)).toEqual(['imei']);

    // Voltar o modelo antigo traz o valor de volta ao formulário, sem migração.
    const voltou = await api.put<{ customFields: Record<string, string> }>(`/api/assets/${ativo.id}`, {
      modelId: cenario.modelId,
    });
    expect(voltou.body.customFields).toEqual({ patrimonio_contabil: 'PAT-9999' });
  });
});

describe('D61 — obrigatoriedade é do VÍNCULO, e vale em todo save', () => {
  it('o mesmo campo é obrigatório num conjunto e opcional noutro', async () => {
    const campo = await criarCampo(api, { name: 'Centro De Custo Do Vinculo' });
    const exigente = await criarConjunto(api, 'Notebooks — exige centro de custo');
    const relaxado = await criarConjunto(api, 'Periféricos — centro de custo opcional');

    await comporConjunto(api, exigente, [{ fieldId: campo.id, required: true }]);
    await comporConjunto(api, relaxado, [{ fieldId: campo.id, required: false }]);

    const fabricanteId = await criarFabricante(api, 'Fabricante dos dois conjuntos');
    const modeloExigente = await criarModelo(api, {
      categoriaId: cenario.categoriaId, fabricanteId, name: 'Modelo exigente',
    });
    const modeloRelaxado = await criarModelo(api, {
      categoriaId: cenario.categoriaId, fabricanteId, name: 'Modelo relaxado',
    });
    await pendurarConjunto(api, { modelId: modeloExigente }, exigente);
    await pendurarConjunto(api, { modelId: modeloRelaxado }, relaxado);

    // No conjunto exigente, criar sem o campo é 422 — com o slug no caminho.
    const recusado = await api.post<{ error: string; fields: Record<string, string> }>('/api/assets', {
      statusId: cenario.statusDeployableId, modelId: modeloExigente, customFields: {},
    });
    expect(recusado.status).toBe(422);
    expect(recusado.body.fields.centro_de_custo_do_vinculo).toMatch(/obrigatório/);

    // No relaxado, o MESMO campo vazio passa.
    const aceito = await api.post('/api/assets', {
      statusId: cenario.statusDeployableId, modelId: modeloRelaxado, customFields: {},
    });
    expect(aceito.status).toBe(201);
  });

  it('vale na CRIAÇÃO mesmo SEM a chave `customFields` no corpo', async () => {
    // ═════════════════════════════════════════════════════════════════════════
    // O FURO QUE ISTO FECHA.
    //
    // `undefined` significa "não mexe" na EDIÇÃO — é o que permite trocar o
    // modelo de um ativo antigo sem exigir os obrigatórios do conjunto novo, e
    // sem isso a promoção gradual do D61 travaria o parque inteiro.
    //
    // Na CRIAÇÃO não há nada para preservar, então a chave ausente e `{}` são a
    // mesma coisa. Tratá-las diferente deixava `POST /api/assets` sem a chave
    // criar ativo inválido: o formulário sempre a manda, então o furo não
    // aparecia na tela — e o "obrigatório" passava a valer só para quem usava o
    // painel, nunca para quem chamava a API.
    // ═════════════════════════════════════════════════════════════════════════
    const campo = await criarCampo(api, { name: 'Campo Da Criacao Sem Chave' });
    const conjunto = await criarConjunto(api, 'Conjunto da criação sem chave');
    await comporConjunto(api, conjunto, [{ fieldId: campo.id, required: true }]);

    const fabricanteId = await criarFabricante(api, 'Fabricante da criação sem chave');
    const modelId = await criarModelo(api, {
      categoriaId: cenario.categoriaId, fabricanteId, name: 'Modelo da criação sem chave',
    });
    await pendurarConjunto(api, { modelId }, conjunto);

    // SEM `customFields` no corpo — que é o caminho de quem chama a API à mão.
    const semAChave = await api.post<{ fields: Record<string, string> }>('/api/assets', {
      statusId: cenario.statusDeployableId, modelId,
    });
    expect(semAChave.status).toBe(422);
    expect(semAChave.body.fields[campo.slug]).toMatch(/obrigatório/);

    // Com o valor, passa.
    const comValor = await api.post('/api/assets', {
      statusId: cenario.statusDeployableId, modelId,
      customFields: { [campo.slug]: 'preenchido' },
    });
    expect(comValor.status).toBe(201);
  });

  it('a chave ausente continua sendo "não mexe" na EDIÇÃO', async () => {
    // O outro lado da mesma moeda: a correção acima NÃO pode ter endurecido a
    // edição, senão a promoção gradual do D61 para de funcionar.
    const campo = await criarCampo(api, { name: 'Campo Da Edicao Sem Chave' });
    const conjunto = await criarConjunto(api, 'Conjunto da edição sem chave');
    await comporConjunto(api, conjunto, [{ fieldId: campo.id, required: false }]);

    const fabricanteId = await criarFabricante(api, 'Fabricante da edição sem chave');
    const modelId = await criarModelo(api, {
      categoriaId: cenario.categoriaId, fabricanteId, name: 'Modelo da edição sem chave',
    });
    await pendurarConjunto(api, { modelId }, conjunto);

    const criado = await api.post<{ id: string }>('/api/assets', {
      statusId: cenario.statusDeployableId, modelId,
    });
    expect(criado.status).toBe(201);

    // Promovido a obrigatório com o ativo já vazio.
    await comporConjunto(api, conjunto, [{ fieldId: campo.id, required: true }]);

    const sohONome = await api.put(`/api/assets/${criado.body.id}`, { name: 'Renomeado sem a chave' });
    expect(sohONome.status).toBe(200);
  });

  it('vale na EDIÇÃO também: limpar um obrigatório é 422', async () => {
    const campo = await criarCampo(api, { name: 'Campo Que Nao Se Limpa' });
    const conjunto = await criarConjunto(api, 'Conjunto que não se limpa');
    await comporConjunto(api, conjunto, [{ fieldId: campo.id, required: true }]);

    const fabricanteId = await criarFabricante(api, 'Fabricante do que não se limpa');
    const modelId = await criarModelo(api, {
      categoriaId: cenario.categoriaId, fabricanteId, name: 'Modelo que não se limpa',
    });
    await pendurarConjunto(api, { modelId }, conjunto);

    const criado = await api.post<{ id: string }>('/api/assets', {
      statusId: cenario.statusDeployableId, modelId,
      customFields: { [campo.slug]: 'preenchido' },
    });
    expect(criado.status).toBe(201);

    // Valer só na criação faria "obrigatório" não significar nada.
    const limpou = await api.put(`/api/assets/${criado.body.id}`, {
      customFields: { [campo.slug]: '' },
    });
    expect(limpou.status).toBe(422);
  });

  it('a chave AUSENTE não mexe nos valores nem cobra os obrigatórios', async () => {
    // `undefined` = "não mexe", a mesma regra de todo campo da edição. É o que
    // permite a promoção gradual do D61: opcional → backfill → obrigatório, sem
    // travar a troca de status de um ativo antigo pelo caminho.
    const campo = await criarCampo(api, { name: 'Campo Promovido' });
    const conjunto = await criarConjunto(api, 'Conjunto da promoção');
    await comporConjunto(api, conjunto, [{ fieldId: campo.id, required: false }]);

    const fabricanteId = await criarFabricante(api, 'Fabricante da promoção');
    const modelId = await criarModelo(api, {
      categoriaId: cenario.categoriaId, fabricanteId, name: 'Modelo da promoção',
    });
    await pendurarConjunto(api, { modelId }, conjunto);

    const criado = await api.post<{ id: string }>('/api/assets', {
      statusId: cenario.statusDeployableId, modelId,
    });
    expect(criado.status).toBe(201);

    // O campo é PROMOVIDO a obrigatório, com o ativo antigo já vazio.
    await comporConjunto(api, conjunto, [{ fieldId: campo.id, required: true }]);

    // Editar OUTRO campo continua possível: `customFields` não veio no corpo.
    const mexeuNoutro = await api.put(`/api/assets/${criado.body.id}`, { name: 'Renomeado' });
    expect(mexeuNoutro.status).toBe(200);

    // Mas mexer nos campos customizados passa a cobrar o obrigatório.
    const mexeuNeles = await api.put(`/api/assets/${criado.body.id}`, { customFields: {} });
    expect(mexeuNeles.status).toBe(422);
  });

  it('o contador `quebrariam` sai na composição, antes de promover', async () => {
    const campo = await criarCampo(api, { name: 'Campo Do Contador' });
    const conjunto = await criarConjunto(api, 'Conjunto do contador');
    await comporConjunto(api, conjunto, [{ fieldId: campo.id, required: false }]);

    const fabricanteId = await criarFabricante(api, 'Fabricante do contador');
    const modelId = await criarModelo(api, {
      categoriaId: cenario.categoriaId, fabricanteId, name: 'Modelo do contador',
    });
    await pendurarConjunto(api, { modelId }, conjunto);

    // Dois ativos vazios e um preenchido.
    await criarAtivo(api, { statusId: cenario.statusDeployableId, modelId, name: 'Vazio 1' });
    await criarAtivo(api, { statusId: cenario.statusDeployableId, modelId, name: 'Vazio 2' });
    const cheio = await criarAtivo(api, {
      statusId: cenario.statusDeployableId, modelId, name: 'Cheio',
    });
    await api.put(`/api/assets/${cheio.id}`, { customFields: { [campo.slug]: 'tem valor' } });

    const { body } = await api.get<{
      modelosAlcancados: number; fields: { slug: string; quebrariam: number }[];
    }>(`/api/custom-fieldsets/${conjunto}/fields`);

    // É o número que decide se a promoção acontece hoje ou depois do backfill.
    expect(body.modelosAlcancados).toBe(1);
    expect(body.fields[0].quebrariam).toBe(2);

    // Depois de promovido, o contador zera: um campo obrigatório não pode ter
    // ativo inválido no escopo dele, porque nenhum save passaria.
    await comporConjunto(api, conjunto, [{ fieldId: campo.id, required: true }]);
    const depois = await api.get<{ fields: { quebrariam: number }[] }>(
      `/api/custom-fieldsets/${conjunto}/fields`,
    );
    expect(depois.body.fields[0].quebrariam).toBe(0);
  });
});

describe('a composição: ordem, padrão e as recusas', () => {
  it('a ordem é a do array, e reordenar N vínculos não colide', async () => {
    // `ordem` NÃO é único de propósito: com `@@unique([fieldsetId, ordem])` o
    // segundo `update` da reordenação colidiria com o primeiro no meio da
    // transação, porque constraint do Postgres é imediata.
    const a = await criarCampo(api, { name: 'Ordem A' });
    const b = await criarCampo(api, { name: 'Ordem B' });
    const c = await criarCampo(api, { name: 'Ordem C' });
    const conjunto = await criarConjunto(api, 'Conjunto da ordem');

    await comporConjunto(api, conjunto, [{ fieldId: a.id }, { fieldId: b.id }, { fieldId: c.id }]);
    const primeira = await api.get<{ fields: { slug: string; ordem: number }[] }>(
      `/api/custom-fieldsets/${conjunto}/fields`,
    );
    expect(primeira.body.fields.map((f) => f.slug)).toEqual(['ordem_a', 'ordem_b', 'ordem_c']);

    // Inverte tudo de uma vez — é o que a tela de arrastar-e-soltar manda.
    const invertida = await comporConjunto(api, conjunto, [
      { fieldId: c.id }, { fieldId: b.id }, { fieldId: a.id },
    ]);
    expect(invertida.fields.map((f) => f.slug)).toEqual(['ordem_c', 'ordem_b', 'ordem_a']);
    expect(invertida.fields.map((f) => f.ordem)).toEqual([0, 1, 2]);
  });

  it('o `defaultValue` é validado no CADASTRO do conjunto, não na criação do ativo', async () => {
    // Um padrão inválido gravado aqui faria a criação de ativo responder 422
    // apontando um campo que quem cadastra o ativo não configurou e não pode
    // corrigir — o erro apareceria na tela errada, para a pessoa errada.
    const campo = await criarCampo(api, { name: 'IP Com Padrao', format: 'IPV4' });
    const conjunto = await criarConjunto(api, 'Conjunto do padrão');

    const { status, body } = await api.put<{ error: string }>(
      `/api/custom-fieldsets/${conjunto}/fields`,
      { fields: [{ fieldId: campo.id, required: false, defaultValue: 'nao-e-ip' }] },
    );
    expect(status).toBe(422);
    expect(body.error).toMatch(/Valor padrão inválido/);
  });

  it('o `defaultValue` entra na CRIAÇÃO e não na edição', async () => {
    const campo = await criarCampo(api, { name: 'Campo Com Padrao' });
    const conjunto = await criarConjunto(api, 'Conjunto com padrão válido');
    await comporConjunto(api, conjunto, [{ fieldId: campo.id, defaultValue: 'PADRAO' }]);

    const fabricanteId = await criarFabricante(api, 'Fabricante do padrão');
    const modelId = await criarModelo(api, {
      categoriaId: cenario.categoriaId, fabricanteId, name: 'Modelo do padrão',
    });
    await pendurarConjunto(api, { modelId }, conjunto);

    const criado = await api.post<{ id: string; customFields: Record<string, string> }>('/api/assets', {
      statusId: cenario.statusDeployableId, modelId, customFields: {},
    });
    expect(criado.body.customFields).toEqual({ campo_com_padrao: 'PADRAO' });

    // Na edição o padrão NÃO volta: aplicá-lo sobrescreveria, a cada salvamento,
    // um campo que alguém apagou de propósito.
    const limpou = await api.put<{ customFields: Record<string, string> | null }>(
      `/api/assets/${criado.body.id}`, { customFields: { campo_com_padrao: '' } },
    );
    expect(limpou.body.customFields).toBeNull();
  });

  it('recusa o mesmo campo duas vezes e campo inexistente', async () => {
    const campo = await criarCampo(api, { name: 'Campo Repetido' });
    const conjunto = await criarConjunto(api, 'Conjunto do repetido');

    const repetido = await api.put<{ error: string }>(`/api/custom-fieldsets/${conjunto}/fields`, {
      fields: [{ fieldId: campo.id, required: false }, { fieldId: campo.id, required: true }],
    });
    expect(repetido.status).toBe(422);
    expect(repetido.body.error).toMatch(/mais de uma vez/);

    const fantasma = await api.put<{ error: string }>(`/api/custom-fieldsets/${conjunto}/fields`, {
      fields: [{ fieldId: '00000000-0000-4000-8000-000000000000', required: false }],
    });
    expect(fantasma.status).toBe(422);
    expect(fantasma.body.error).toMatch(/inexistente/);
  });

  it('esvaziar a composição é legítimo e NÃO apaga o conjunto', async () => {
    const campo = await criarCampo(api, { name: 'Campo Que Sai' });
    const conjunto = await criarConjunto(api, 'Conjunto que esvazia');
    await comporConjunto(api, conjunto, [{ fieldId: campo.id }]);

    const vazio = await comporConjunto(api, conjunto, []);
    expect(vazio.fields).toHaveLength(0);
    expect(await prisma.customFieldset.count({ where: { id: conjunto } })).toBe(1);
  });

  it('o `createdAt` do vínculo que CONTINUA no conjunto não é reiniciado', async () => {
    // `deleteMany` + `createMany` seria mais curto e perderia a data em que
    // aquele campo passou a ser pedido — que é justamente o que se olha ao
    // investigar por que um ativo antigo não tem valor nele.
    const a = await criarCampo(api, { name: 'Vinculo Antigo' });
    const b = await criarCampo(api, { name: 'Vinculo Novo' });
    const conjunto = await criarConjunto(api, 'Conjunto do createdAt');

    await comporConjunto(api, conjunto, [{ fieldId: a.id }]);
    const antes = await prisma.customFieldsetField.findUniqueOrThrow({
      where: { fieldsetId_fieldId: { fieldsetId: conjunto, fieldId: a.id } },
      select: { createdAt: true },
    });

    await comporConjunto(api, conjunto, [{ fieldId: b.id }, { fieldId: a.id }]);
    const depois = await prisma.customFieldsetField.findUniqueOrThrow({
      where: { fieldsetId_fieldId: { fieldsetId: conjunto, fieldId: a.id } },
      select: { createdAt: true, ordem: true },
    });

    expect(depois.createdAt.toISOString()).toBe(antes.createdAt.toISOString());
    // E a ordem foi atualizada: ele passou a ser o segundo.
    expect(depois.ordem).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// O BACKFILL EM MASSA — a porta que o D61 manda usar e que não existia
// ─────────────────────────────────────────────────────────────────────────────
//
// O contador `quebrariam` (testado acima) diz quantos ativos ficariam inválidos
// se o campo virasse obrigatório, e a tela de composição manda *"preencher em
// massa primeiro e promover depois"*. O lote da F2 só sabia status, localização e
// lixeira: o número estava certo e o caminho não existia — mil ativos eram mil
// formulários.
//
// Este bloco exercita o caminho inteiro, na ordem em que a operação acontece de
// verdade: preencher → conferir que o contador zerou → promover → e só então o
// obrigatório passa a barrar o esvaziamento.
describe('o preenchimento em massa — o backfill do D61', () => {
  let centroDeCusto: { id: string; slug: string };
  let ipFixo: { id: string; slug: string };
  let conjunto: string;
  let modelId: string;
  let ativos: { id: string; assetTag: string }[];

  beforeAll(async () => {
    centroDeCusto = await criarCampo(api, { name: 'Centro De Custo Do Lote' });
    // Um campo COM formato, para provar que o lote confere o valor antes de
    // escrever: `ANY` não tem o que violar.
    ipFixo = await criarCampo(api, { name: 'IP Fixo Do Lote', format: 'IPV4' });

    conjunto = await criarConjunto(api, 'Conjunto do backfill em massa');
    await comporConjunto(api, conjunto, [
      { fieldId: centroDeCusto.id, required: false },
      { fieldId: ipFixo.id, required: false },
    ]);

    const fabricanteId = await criarFabricante(api, 'Fabricante do backfill');
    modelId = await criarModelo(api, {
      categoriaId: cenario.categoriaId, fabricanteId, name: 'Modelo do backfill',
    });
    await pendurarConjunto(api, { modelId }, conjunto);

    // Três ativos VAZIOS: é o parque antigo que a promoção travaria.
    ativos = [];
    for (const name of ['Backfill 1', 'Backfill 2', 'Backfill 3']) {
      ativos.push(await criarAtivo(api, { statusId: cenario.statusDeployableId, modelId, name }));
    }
  });

  /** O `quebrariam` de um campo, pelo slug — a composição tem dois. */
  async function quebrariamDe(slug: string): Promise<number> {
    const { body } = await api.get<{ fields: { slug: string; quebrariam: number }[] }>(
      `/api/custom-fieldsets/${conjunto}/fields`,
    );
    return body.fields.find((campo) => campo.slug === slug)!.quebrariam;
  }

  it('preenche os três de uma vez, e o contador do D61 zera', async () => {
    // O número de ANTES é a razão de a operação existir: três ativos travariam.
    expect(await quebrariamDe(centroDeCusto.slug)).toBe(3);

    const { status, body } = await api.post<{ op: string; afetados: number; batchId: string }>(
      '/api/assets/bulk',
      {
        op: 'custom-field',
        ids: ativos.map((ativo) => ativo.id),
        fieldId: centroDeCusto.id,
        value: 'TI-001',
      },
    );

    expect(status).toBe(200);
    expect(body).toMatchObject({ op: 'custom-field', afetados: 3 });

    for (const ativo of ativos) {
      const lido = await api.get<{ customFields: Record<string, string> }>(`/api/assets/${ativo.id}`);
      expect(lido.body.customFields[centroDeCusto.slug]).toBe('TI-001');
    }

    // E o contador zerou: é ele que autoriza a promoção.
    expect(await quebrariamDe(centroDeCusto.slug)).toBe(0);
    // O OUTRO campo continua vazio nos três — o lote mexe em UMA chave.
    expect(await quebrariamDe(ipFixo.slug)).toBe(3);
  });

  it('grava uma linha de histórico por ativo, com a chave PLANA `cf.<slug>`', async () => {
    const chave = `cf.${centroDeCusto.slug}`;

    const logs = await prisma.activityLog.findMany({
      where: { entityType: 'Asset', entityId: { in: ativos.map((ativo) => ativo.id) }, action: 'UPDATE' },
      select: { entityId: true, changes: true },
    });

    const doLote = logs.filter(
      (log) => (log.changes as Record<string, unknown>)[chave] !== undefined,
    );

    // UMA por ativo, nunca uma pelo lote: a aba Histórico é de um ativo.
    expect(doLote).toHaveLength(3);

    // O MESMO `batchId` nas três, e a forma `{ de, para }` que a aba reconhece —
    // aninhada, o leitor genérico a classificaria como "detalhe" e imprimiria
    // `[object Object]`.
    const batchIds = new Set<string>();
    for (const log of doLote) {
      const changes = log.changes as Record<string, unknown> & {
        batchId: string; batchSize: number;
      };
      batchIds.add(changes.batchId);
      expect(changes.batchSize).toBe(3);
      expect(changes[chave]).toEqual({ de: null, para: 'TI-001' });
    }
    expect(batchIds.size).toBe(1);
  });

  it('recusa o LOTE INTEIRO quando um dos ativos não pede o campo (D21)', async () => {
    // Um ativo de outro modelo, cujo conjunto não tem este campo. Gravar nele
    // criaria uma chave invisível em toda tela e imune a toda validação.
    const forasteiro = await criarAtivo(api, {
      statusId: cenario.statusDeployableId, modelId: cenario.modelId, name: 'Forasteiro do lote',
    });

    const { status, body } = await api.post<{ error: string }>('/api/assets/bulk', {
      op: 'custom-field',
      ids: [...ativos.map((ativo) => ativo.id), forasteiro.id],
      fieldId: centroDeCusto.id,
      value: 'TI-999',
    });

    expect(status).toBe(422);
    expect(body.error).toContain(forasteiro.assetTag);

    // TUDO OU NADA: os três que seriam alterados continuam com o valor anterior.
    const lido = await api.get<{ customFields: Record<string, string> }>(`/api/assets/${ativos[0].id}`);
    expect(lido.body.customFields[centroDeCusto.slug]).toBe('TI-001');

    // E o forasteiro não ganhou chave nenhuma.
    const dele = await prisma.asset.findUniqueOrThrow({
      where: { id: forasteiro.id }, select: { customFields: true },
    });
    expect(dele.customFields).toBeNull();
  });

  it('recusa valor fora do formato ANTES de escrever em qualquer linha', async () => {
    const { status, body } = await api.post<{ error: string; fields: Record<string, string> }>(
      '/api/assets/bulk',
      { op: 'custom-field', ids: ativos.map((a) => a.id), fieldId: ipFixo.id, value: '999.1.1.1' },
    );

    expect(status).toBe(422);
    // O `slug` no `fields`, como em todo 422 de campo customizado: é por ele que
    // a tela pinta a mensagem no lugar certo.
    expect(body.fields).toHaveProperty(ipFixo.slug);

    // Nenhuma linha recebeu o valor inválido.
    expect(await quebrariamDe(ipFixo.slug)).toBe(3);
  });

  it('recusa campo CIFRADO em lote — um segredo igual em N máquinas não é segredo', async () => {
    const segredo = await criarCampo(api, { name: 'Senha Do BIOS Em Lote', encrypted: true });

    const { status, body } = await api.post<{ error: string }>('/api/assets/bulk', {
      op: 'custom-field', ids: [ativos[0].id], fieldId: segredo.id, value: 'senha-unica',
    });

    expect(status).toBe(422);
    expect(body.error).toContain('cifrado');
  });

  it('limpar em massa REMOVE a chave, em vez de gravar `null` nela', async () => {
    const ids = ativos.map((ativo) => ativo.id);

    const preenchido = await api.post('/api/assets/bulk', {
      op: 'custom-field', ids, fieldId: ipFixo.id, value: '10.0.0.7',
    });
    expect(preenchido.status).toBe(200);
    expect(await quebrariamDe(ipFixo.slug)).toBe(0);

    // `value: null` é limpar.
    const limpo = await api.post('/api/assets/bulk', {
      op: 'custom-field', ids, fieldId: ipFixo.id, value: null,
    });
    expect(limpo.status).toBe(200);

    // A CHAVE SAIU, e não ficou com `null` dentro: um `{"ip_fixo": null}` faria
    // `customFields ? 'ip_fixo'` continuar verdadeiro, e o contador do D61 — que
    // conta quem NÃO tem a chave — passaria a mentir.
    const bruto = await prisma.asset.findUniqueOrThrow({
      where: { id: ativos[0].id }, select: { customFields: true },
    });
    expect(Object.keys(bruto.customFields as object)).not.toContain(ipFixo.slug);
    // O outro campo continua lá: limpar um não limpa o resto.
    expect(bruto.customFields).toMatchObject({ [centroDeCusto.slug]: 'TI-001' });

    expect(await quebrariamDe(ipFixo.slug)).toBe(3);
  });

  it('depois de PROMOVIDO a obrigatório, o lote não esvazia mais o campo', async () => {
    // A promoção que o backfill autorizou — o contador está em zero desde o
    // primeiro teste deste bloco.
    await comporConjunto(api, conjunto, [
      { fieldId: centroDeCusto.id, required: true },
      { fieldId: ipFixo.id, required: false },
    ]);

    // Editar outro campo de um ativo antigo continua passando: o backfill fez o
    // trabalho que a promoção exigia.
    const edicao = await api.put(`/api/assets/${ativos[0].id}`, { name: 'Vivo depois da promoção' });
    expect(edicao.status).toBe(200);

    // Mas esvaziar em massa é recusado: o obrigatório vale em TODO save, e um
    // lote que o furasse deixaria N ativos num estado que a edição de um só não
    // produz.
    const { status, body } = await api.post<{ error: string }>('/api/assets/bulk', {
      op: 'custom-field',
      ids: ativos.map((ativo) => ativo.id),
      fieldId: centroDeCusto.id,
      value: null,
    });

    expect(status).toBe(422);
    expect(body.error).toContain('obrigatório');

    // O valor continua lá nos três.
    const lido = await api.get<{ customFields: Record<string, string> }>(`/api/assets/${ativos[0].id}`);
    expect(lido.body.customFields[centroDeCusto.slug]).toBe('TI-001');
  });

  it('TROCAR o valor em massa sobrescreve, e o histórico guarda o de/para', async () => {
    const { status } = await api.post('/api/assets/bulk', {
      op: 'custom-field',
      ids: [ativos[1].id],
      fieldId: centroDeCusto.id,
      value: 'TI-002',
    });
    expect(status).toBe(200);

    const lido = await api.get<{ customFields: Record<string, string> }>(`/api/assets/${ativos[1].id}`);
    expect(lido.body.customFields[centroDeCusto.slug]).toBe('TI-002');

    // O valor antigo não se perde: ele está no `de` da linha do histórico, que é
    // o que permite desfazer um lote aplicado por engano.
    const logs = await prisma.activityLog.findMany({
      where: { entityType: 'Asset', entityId: ativos[1].id, action: 'UPDATE' },
      select: { changes: true },
    });
    const diffs = logs
      .map((log) => (log.changes as Record<string, { de: string | null; para: string | null }>)[`cf.${centroDeCusto.slug}`])
      .filter(Boolean);

    expect(diffs).toEqual(expect.arrayContaining([{ de: 'TI-001', para: 'TI-002' }]));
  });

  it('`value: ""` é limpar, e NÃO grava string vazia — a armadilha do input React', async () => {
    // O defeito 1 da auditoria da F0/F1 nasceu daqui: todo input React inicializa
    // com `''` e MANDA a chave, vazia. A barra converte para `null` antes de
    // enviar, e o servidor normaliza de novo — as duas pontas dizem a mesma
    // coisa, e é o que este teste prende.
    //
    // Se `''` fosse gravado como valor, `customFields ? 'ip_fixo'` passaria a ser
    // verdadeiro para quem apagou o campo, e o contador do D61 contaria errado.
    const ids = [ativos[2].id];

    await api.post('/api/assets/bulk', {
      op: 'custom-field', ids, fieldId: ipFixo.id, value: '192.168.0.9',
    });

    const limpo = await api.post('/api/assets/bulk', {
      op: 'custom-field', ids, fieldId: ipFixo.id, value: '',
    });
    expect(limpo.status).toBe(200);

    const bruto = await prisma.asset.findUniqueOrThrow({
      where: { id: ativos[2].id }, select: { customFields: true },
    });
    expect(Object.keys(bruto.customFields as object)).not.toContain(ipFixo.slug);
  });
});
