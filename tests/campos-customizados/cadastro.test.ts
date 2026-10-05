import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarApi, type ApiDeTeste } from '../helpers/app';
import {
  cenarioDePosse, comporConjunto, criarAtivo, criarCampo, criarConjunto, pendurarConjunto,
} from '../helpers/fixtures';
import { prisma } from '../../server/core/database/prismaClient';

// O CADASTRO DE UM CAMPO — e as quatro coisas que ele NÃO deixa fazer.
//
// A parte plana é CRUD de catálogo (D64), e o CRUD genérico já tem teste. O que
// se prova aqui é o que a spec acrescenta, e cada guarda existe porque a
// alternativa estraga dado:
//
//   1. o `slug` é imutável (D60)         → renomear é um UPDATE em N mil linhas
//   2. `encrypted` não vira com valor    → ligar não recifra o passado; desligar
//                                          mostra `enc:v1:…` na tela
//   3. elemento × formato × cifra        → campo que GRAVA e não FUNCIONA
//   4. o 409 conta vínculo E ativo       → apagar deixaria valor órfão sem aviso

let api: ApiDeTeste;
let cenario: Awaited<ReturnType<typeof cenarioDePosse>>;

beforeAll(async () => {
  api = await criarApi();
  cenario = await cenarioDePosse(api);
});

afterAll(async () => {
  await api.fechar();
});

describe('o slug nasce do nome', () => {
  it('deriva sem acento e sem o nome precisar ser digitado duas vezes', async () => {
    const campo = await criarCampo(api, { name: 'Nº do Patrimônio' });
    expect(campo.slug).toBe('n_do_patrimonio');
  });

  it('aceita o slug explícito quando ele vem', async () => {
    const campo = await criarCampo(api, { name: 'Host Name', slug: 'hostname' });
    expect(campo.slug).toBe('hostname');
  });

  it('recusa slug fora do formato de nome de propriedade', async () => {
    // Ele é chave de JSON e de query string ao mesmo tempo: qualquer coisa fora
    // de `[a-z0-9_]` exigiria escape num dos dois lugares.
    const { status, body } = await api.post<{ fields: Record<string, string> }>('/api/custom-fields', {
      name: 'Campo Ruim', slug: 'Campo-Ruim',
    });
    expect(status).toBe(422);
    expect(body.fields.slug).toMatch(/letras minúsculas/);
  });
});

describe('D60 — o slug é imutável', () => {
  it('deixa mudar o NOME à vontade e recusa mudar o slug', async () => {
    const campo = await criarCampo(api, { name: 'Centro de Custo' });

    // O nome é o que aparece na tela: muda sem cerimônia.
    const renomeado = await api.put(`/api/custom-fields/${campo.id}`, { name: 'Centro de custo (RH)' });
    expect(renomeado.status).toBe(200);

    const trocado = await api.put<{ error: string; slug: string }>(`/api/custom-fields/${campo.id}`, {
      slug: 'centro_custo',
    });
    expect(trocado.status).toBe(409);
    // A mensagem ENSINA a saída — é a regra do docs/referencia/invariantes.md.
    expect(trocado.body.error).toMatch(/crie outro campo/i);
    expect(trocado.body.slug).toBe('centro_de_custo');
  });

  it('reenviar o MESMO slug passa — o formulário manda todo campo a cada save', async () => {
    const campo = await criarCampo(api, { name: 'Ramal' });
    const { status } = await api.put(`/api/custom-fields/${campo.id}`, {
      name: 'Ramal interno', slug: campo.slug,
    });
    // Recusar aqui travaria a tela: reenviar o valor atual não é uma tentativa
    // de mudança.
    expect(status).toBe(200);
  });
});

describe('coerência entre elemento, formato e cifra', () => {
  it('recusa REGEX sem padrão', async () => {
    const { status, body } = await api.post<{ error: string }>('/api/custom-fields', {
      name: 'Codigo Interno', format: 'REGEX',
    });
    expect(status).toBe(422);
    expect(body.error).toMatch(/exige o padrão/);
  });

  it('recusa no CADASTRO o padrão com quantificador aninhado (D63)', async () => {
    // ═════════════════════════════════════════════════════════════════════════
    // A GUARDA TEM QUE ESTAR AQUI, e não só no motor de validação.
    //
    // O motor também a consulta, e um padrão recusado por ele vira um validador
    // que recusa TUDO — seguro, e na tela errada: o padrão entrava no catálogo
    // calado, e quem descobria era a pessoa preenchendo o formulário de um
    // ativo, com uma mensagem sobre uma configuração que ela não fez.
    //
    // `(a+)+$` contra 40 caracteres não é um erro 500: o Node é single-threaded,
    // e é o servidor inteiro fora do ar enquanto o motor de regex não desiste.
    // ═════════════════════════════════════════════════════════════════════════
    const { status, body } = await api.post<{ error: string; fields: Record<string, string> }>(
      '/api/custom-fields',
      { name: 'Codigo Perigoso', format: 'REGEX', regexPattern: '(a+)+$' },
    );
    expect(status).toBe(422);
    expect(body.error).toMatch(/quantificador aninhado/);
    // O `slug` do campo do FORMULÁRIO no caminho: é nele que a tela pinta a
    // mensagem, e não numa faixa no topo.
    expect(body.fields.regexPattern).toBeDefined();
  });

  it('recusa padrão sintaticamente inválido, e aceita padrão comum', async () => {
    const invalido = await api.post<{ error: string }>('/api/custom-fields', {
      name: 'Codigo Quebrado', format: 'REGEX', regexPattern: '([a-z',
    });
    expect(invalido.status).toBe(422);
    expect(invalido.body.error).toMatch(/não é uma expressão regular válida/);

    const ok = await api.post('/api/custom-fields', {
      name: 'Codigo Do Patrimonio', format: 'REGEX', regexPattern: '^[A-Z]{3}-\\d{4}$',
    });
    expect(ok.status).toBe(201);
  });

  it('recusa LISTBOX sem valores', async () => {
    const { status, body } = await api.post<{ error: string }>('/api/custom-fields', {
      name: 'Tamanho da RAM', element: 'LISTBOX',
    });
    expect(status).toBe(422);
    expect(body.error).toMatch(/ao menos um valor/);
  });

  it('recusa cifrar o que não é campo de texto', async () => {
    const { status, body } = await api.post<{ error: string }>('/api/custom-fields', {
      name: 'Tem Senha', element: 'CHECKBOX', encrypted: true,
    });
    expect(status).toBe(422);
    expect(body.error).toMatch(/Só campo de texto pode ser cifrado/);
  });

  it('recusa campo cifrado como coluna da listagem (D62)', async () => {
    // A coluna mostraria `••••••` em toda linha: espaço ocupado para não
    // informar nada, e sugerindo que o valor está ali.
    const { status, body } = await api.post<{ error: string }>('/api/custom-fields', {
      name: 'Senha do BIOS', encrypted: true, showInListView: true,
    });
    expect(status).toBe(422);
    expect(body.error).toMatch(/não pode virar coluna/);
  });

  it('recusa TEXTO DE VÁRIAS LINHAS como coluna da listagem', async () => {
    // A ajuda do elemento, no formulário, promete exatamente isto — e até a
    // correção nada cumpria a frase: marcar a caixa punha a observação de dois
    // mil caracteres numa célula de tabela. Um rótulo que promete uma regra que
    // não existe é pior que a ausência dos dois.
    const { status, body } = await api.post<{ error: string }>('/api/custom-fields', {
      name: 'Observacao Longa', element: 'TEXTAREA', showInListView: true,
    });
    expect(status).toBe(422);
    expect(body.error).toMatch(/várias linhas não pode virar coluna/);
  });

  it('a rota de colunas não devolve cifrado nem várias linhas, mesmo gravado por fora', async () => {
    // As duas guardas acima valem para o que passa pela API. Esta linha entra por
    // `prisma` de propósito: é o seed e o `psql` à mão que a rota precisa
    // sobreviver, e uma coluna de máscara repetida é o tipo de defeito que
    // ninguém reporta.
    const porFora = await prisma.customField.create({
      data: {
        name: 'Gravado Por Fora', slug: 'gravado_por_fora',
        element: 'TEXTAREA', showInListView: true,
      },
      select: { slug: true },
    });

    const { body } = await api.get<{ slug: string }[]>('/api/custom-fields/list-view');
    expect(body.map((campo) => campo.slug)).not.toContain(porFora.slug);
  });
});

describe('a cifra não vira depois que há valor gravado', () => {
  it('recusa ligar a cifra de um campo já preenchido, dizendo em quantos ativos', async () => {
    const campo = await criarCampo(api, { name: 'Chave Wifi Antiga' });
    const conjunto = await criarConjunto(api, 'Conjunto da cifra');
    await comporConjunto(api, conjunto, [{ fieldId: campo.id }]);
    await pendurarConjunto(api, { modelId: cenario.modelId }, conjunto);

    const ativo = await criarAtivo(api, {
      statusId: cenario.statusDeployableId, modelId: cenario.modelId, name: 'Ativo com valor',
    });
    const gravou = await api.put(`/api/assets/${ativo.id}`, {
      customFields: { [campo.slug]: 'segredo-em-claro' },
    });
    expect(gravou.status).toBe(200);

    const { status, body } = await api.put<{ error: string; emUso: number }>(
      `/api/custom-fields/${campo.id}`, { encrypted: true },
    );
    expect(status).toBe(409);
    // O NÚMERO é o que faz o operador entender o tamanho do estrago evitado.
    expect(body.emUso).toBe(1);
    expect(body.error).toMatch(/não seriam cifrados retroativamente/);

    // Limpa a âncora para não contaminar os testes seguintes do arquivo.
    await pendurarConjunto(api, { modelId: cenario.modelId }, null);
  });

  it('deixa ligar a cifra enquanto NINGUÉM preencheu', async () => {
    const campo = await criarCampo(api, { name: 'Chave Wifi Nova' });
    const { status } = await api.put(`/api/custom-fields/${campo.id}`, { encrypted: true });
    expect(status).toBe(200);
  });
});

describe('D64 — o 409 do delete soma vínculo E ativo', () => {
  it('recusa apagar campo que algum CONJUNTO pede', async () => {
    const campo = await criarCampo(api, { name: 'Campo Vinculado' });
    const conjunto = await criarConjunto(api, 'Conjunto que segura o campo');
    await comporConjunto(api, conjunto, [{ fieldId: campo.id }]);

    const { status, body } = await api.delete<{ error: string; emUso: number }>(
      `/api/custom-fields/${campo.id}`,
    );
    expect(status).toBe(409);
    expect(body.emUso).toBe(1);
    expect(body.error).toMatch(/campo customizado em uso/);
  });

  it('recusa apagar campo com VALOR gravado, mesmo fora de todo conjunto', async () => {
    const campo = await criarCampo(api, { name: 'Campo Com Valor Orfao' });
    const conjunto = await criarConjunto(api, 'Conjunto temporário');
    await comporConjunto(api, conjunto, [{ fieldId: campo.id }]);
    await pendurarConjunto(api, { modelId: cenario.modelId }, conjunto);

    const ativo = await criarAtivo(api, {
      statusId: cenario.statusDeployableId, modelId: cenario.modelId, name: 'Ativo do órfão',
    });
    await api.put(`/api/assets/${ativo.id}`, { customFields: { [campo.slug]: 'valor qualquer' } });

    // O campo SAI do conjunto: nenhum vínculo sobra, e o valor continua no ativo.
    await comporConjunto(api, conjunto, []);
    await pendurarConjunto(api, { modelId: cenario.modelId }, null);

    const vinculos = await prisma.customFieldsetField.count({ where: { fieldId: campo.id } });
    expect(vinculos).toBe(0);

    // É ESTE o caso que a contagem por vínculo sozinha deixaria passar: apagar o
    // campo deixaria o valor órfão em N ativos, sem aviso e sem forma de voltar
    // a aparecer em tela nenhuma.
    const { status, body } = await api.delete<{ error: string; emUso: number }>(
      `/api/custom-fields/${campo.id}`,
    );
    expect(status).toBe(409);
    expect(body.emUso).toBe(1);
  });

  it('apaga o campo que ninguém pede e ninguém preencheu', async () => {
    const campo = await criarCampo(api, { name: 'Campo Descartavel' });
    const { status } = await api.delete(`/api/custom-fields/${campo.id}`);
    expect(status).toBe(200);
  });
});

describe('o conjunto: o 409 conta as ÂNCORAS, não a composição', () => {
  it('apaga conjunto com campos dentro quando nenhuma âncora o usa', async () => {
    // A lista de campos é COMPOSIÇÃO (`onDelete: Cascade`), não alguém que usa o
    // conjunto. Contá-la faria um conjunto recém-montado e nunca atribuído ser
    // indelével — 409 "em uso por 5 registros" para algo que ninguém usa.
    const campo = await criarCampo(api, { name: 'Campo De Conjunto Solto' });
    const conjunto = await criarConjunto(api, 'Conjunto nunca atribuído');
    await comporConjunto(api, conjunto, [{ fieldId: campo.id }]);

    const { status } = await api.delete(`/api/custom-fieldsets/${conjunto}`);
    expect(status).toBe(200);

    // O `Cascade` levou o vínculo junto, e o CAMPO continua de pé.
    expect(await prisma.customFieldsetField.count({ where: { fieldsetId: conjunto } })).toBe(0);
    expect(await prisma.customField.count({ where: { id: campo.id } })).toBe(1);
  });

  it('recusa apagar conjunto atribuído a uma categoria (D58, Restrict)', async () => {
    const conjunto = await criarConjunto(api, 'Conjunto da categoria');
    await pendurarConjunto(api, { categoriaId: cenario.categoriaId }, conjunto);

    const { status, body } = await api.delete<{ emUso: number }>(`/api/custom-fieldsets/${conjunto}`);
    expect(status).toBe(409);
    expect(body.emUso).toBe(1);

    await pendurarConjunto(api, { categoriaId: cenario.categoriaId }, null);
  });
});
