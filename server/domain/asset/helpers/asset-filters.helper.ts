import { z } from 'zod';
import { $Enums, type Prisma } from '@prisma/client';
import { AppError } from '../../../core/errors/app-error';

// Colunas que a listagem de ativos aceita ordenar. Allowlist do DOMÍNIO: o
// parser em core/http/list-query.ts a recebe por parâmetro, porque `core` não
// pode conhecer negócio.
export const ASSET_SORTABLE = ['assetTag', 'name', 'serial', 'purchaseDate', 'createdAt'] as const;
export type AssetSortable = (typeof ASSET_SORTABLE)[number];

// `mode: 'insensitive'` é obrigatório: sem ele buscar "latitude" não acha
// "Latitude". A busca alcança o modelo e o fabricante porque é assim que se
// procura um ativo na prática — "o Dell do fulano", não a etiqueta decorada.
export function buildAssetWhere(q?: string): Prisma.AssetWhereInput {
  if (!q) return {};

  const contem = { contains: q, mode: 'insensitive' } as const;

  return {
    OR: [
      { assetTag: contem },
      { serial: contem },
      { name: contem },
      { orderNumber: contem },
      { model: { name: contem } },
      { model: { manufacturer: { name: contem } } },
    ],
  };
}

// ---------------------------------------------------------------------------
// VISTA E FILTROS DO DOMÍNIO — e não `view` do `core` (D20)
// ---------------------------------------------------------------------------
//
// `trashed` é genérico: toda tabela com `deletedAt` o entende, e por isso mora
// no `core`. "Descomissionado" é `retiredAt IS NOT NULL` e "posto vago" é um
// join em `assignments` × `location_occupants` — os dois só existem no ITAM.
// Pôr isso em `core/http/list-query.ts` seria fazer a infraestrutura conhecer
// negócio, que é o que a seta `pages → domain → core` proíbe e o lint reprova.
//
// A consequência prática: a vista do ATIVO é parseada AQUI, inteira, e o
// controller entrega ao parser genérico só o que sobrou (página, ordem, busca).
// Uma vista, um lugar — traduzir `retired` para `active` antes do `core` e
// guardar a real aqui deixaria duas verdades sobre a mesma chave.

export const ASSET_VIEWS = ['active', 'trashed', 'retired', 'archived'] as const;
export type AssetView = (typeof ASSET_VIEWS)[number];

/** Recortes prontos que respondem a uma pergunta operacional, não a um filtro. */
export const ASSET_RELATORIOS = ['posto-vago'] as const;
export type AssetRelatorio = (typeof ASSET_RELATORIOS)[number];

export interface AssetFilters {
  view: AssetView;
  statusId?: string;
  locationId?: string;
  relatorio?: AssetRelatorio;
  /** `?cf[slug]=valor` — igualdade dentro do JsonB (F9, D63). Vazio quando não veio. */
  cf: Record<string, string>;
}

// ---------------------------------------------------------------------------
// O FILTRO POR CAMPO CUSTOMIZADO — `?cf[slug]=valor` (F9, D63)
// ---------------------------------------------------------------------------
//
// A CHAVE CHEGA LITERAL, COM OS COLCHETES, e é isso que faz esta leitura ser
// possível sem trocar o parser de query do Fastify: o `fast-querystring` é
// plano — ele não interpreta `[...]` como aninhamento —, então
// `?cf[ip_fixo]=10.0.0.7` vira a chave `"cf[ip_fixo]"` com valor `"10.0.0.7"`.
//
// O slug é conferido contra o MESMO formato do cadastro. Uma chave `cf[...]` que
// não casa não é lida aqui e segue para o parser do `core`, que a recusa com 422
// pelo `strictObject` — a mensagem diz "campo não reconhecido: cf[Foo]", que é a
// resposta certa e não precisou de código nenhum.
const CHAVE_DE_CAMPO = /^cf\[([a-z][a-z0-9_]*)\]$/;

/**
 * Teto de filtros de campo customizado por requisição.
 *
 * Cada um é um `AND` a mais no `where`, e cada um custa uma varredura da coluna
 * JsonB (ver `buildAssetFilterWhere`). Sem teto, `?cf[a]=1&cf[b]=2&…` com
 * cinquenta chaves é uma consulta caríssima escrita numa URL.
 */
const MAX_FILTROS_CF = 5;
/** Teto do valor. O que se guarda tem teto de 1.000; procurar por mais é lixo. */
const MAX_VALOR_CF = 200;

/**
 * ATIVO EM POSTO VAGO — equipamento parado em mesa sem ninguém.
 *
 * Posse ABERTA (`checkinAt: null`) cujo alvo é uma localização **sem nenhum
 * ocupante aberto**. É o sinal que nenhum ITAM de prateleira dá, e o candidato
 * natural a voltar para o estoque (docs/referencia/modelo-de-posse.md).
 *
 * FILTRO DO PRISMA, nunca `.filter()` depois da consulta: filtrando no cliente,
 * a página 1 mostraria 3 de 25 linhas e o `total` do envelope mentiria — a
 * paginação inteira passa a descrever um conjunto que a tela não está vendo.
 */
export const POSTO_VAGO: Prisma.AssetWhereInput = {
  assignments: {
    some: {
      checkinAt: null,
      targetType: 'LOCATION',
      targetLocation: { occupants: { none: { endedAt: null } } },
    },
  },
};

// `z.object`, e NÃO `strictObject`: aqui só se lê o que é do domínio e o resto
// (page, perPage, sort, order, q) segue intacto para o parser do `core`, que é
// estrito e continua recusando typo em chave dele.
const assetFiltersSchema = z.object({
  view: z.enum(ASSET_VIEWS, `vista inválida: use ${ASSET_VIEWS.join(', ')}`).default('active'),
  statusId: z.uuid('status: identificador inválido').optional(),
  locationId: z.uuid('localização: identificador inválido').optional(),
  relatorio: z.enum(ASSET_RELATORIOS, `relatório inválido: use ${ASSET_RELATORIOS.join(', ')}`).optional(),
});

/** Derivada do schema para as duas listas não divergirem quando entrar um filtro novo. */
const CHAVES_DO_DOMINIO = Object.keys(assetFiltersSchema.shape);

/**
 * Parte a query da listagem em duas: o que só o ITAM entende e o que o parser
 * genérico do `core` entende.
 *
 * Precisa acontecer ANTES do `parseListQuery`: ele valida com `strictObject` e
 * responderia 422 a `?statusId=` — a mesma proteção que pega `?ordr=asc`.
 */
export function separarFiltrosDeAtivo(raw: unknown): {
  filtros: AssetFilters;
  paraOCore: Record<string, unknown>;
} {
  const query = { ...((raw ?? {}) as Record<string, unknown>) };

  // Os `cf[...]` saem ANTES do schema: eles não são chaves fixas, então nem o
  // `assetFiltersSchema` (que é `z.object`) nem o parser estrito do `core`
  // sabem nomeá-los.
  const cf: Record<string, string> = {};
  for (const chave of Object.keys(query)) {
    const casou = CHAVE_DE_CAMPO.exec(chave);
    if (!casou) continue;

    const slug = casou[1];
    const valor = query[chave];
    delete query[chave];

    // Valor vazio significa "não filtre por isto", e não "ache quem tem string
    // vazia" — que é um estado que não existe (limpar um campo REMOVE a chave).
    if (valor === undefined || valor === '') continue;

    // ── A CHAVE REPETIDA É RECUSADA, NÃO IGNORADA ────────────────────────
    //
    // `?cf[ip_fixo]=10.0.0.7&cf[ip_fixo]=10.0.0.8` faz o parser de query
    // entregar um ARRAY. Descartá-lo em silêncio — que é o que um
    // `typeof valor !== 'string'` faria — devolveria a lista INTEIRA sem filtro
    // nenhum, para uma URL que pediu dois filtros. É a mesma falha muda que o
    // `strictObject` existe para evitar, e ela é pior aqui: a tela mostraria
    // resultado, só não o pedido.
    //
    // E não há o que adivinhar: um campo tem UM valor, então dois valores para a
    // mesma chave não expressam "ou" nem "e" — expressam um erro de quem montou
    // a URL.
    if (typeof valor !== 'string') {
      throw new AppError(
        `cf[${slug}]: o filtro aparece mais de uma vez na consulta. Um campo customizado `
        + 'aceita um valor por filtro.',
        422,
      );
    }

    if (valor.length > MAX_VALOR_CF) {
      throw new AppError(`cf[${slug}]: máximo de ${MAX_VALOR_CF} caracteres`, 422);
    }

    if (valor.trim() === '') continue;

    cf[slug] = valor.trim();
  }

  if (Object.keys(cf).length > MAX_FILTROS_CF) {
    throw new AppError(`Máximo de ${MAX_FILTROS_CF} filtros por campo customizado de uma vez.`, 422);
  }

  const filtros = assetFiltersSchema.parse(query);

  for (const chave of CHAVES_DO_DOMINIO) delete query[chave];

  return { filtros: { ...filtros, cf }, paraOCore: query };
}

/**
 * O `where` das QUATRO vistas.
 *
 * - `active` **exclui** duas coisas, por dois motivos diferentes: o
 *   descomissionado (`retiredAt`), que saiu do PATRIMÔNIO, e o arquivado
 *   (`status.type = ARCHIVED`), que saiu da OPERAÇÃO. Os dois continuam
 *   existindo — o primeiro para o relatório de depreciação (F8) e a auditoria,
 *   o segundo porque arquivar é reversível trocando o status.
 * - `retired` e `archived` mostram **só** um deles cada.
 * - `trashed` é a lixeira e não olha nem `retiredAt` nem status: quem procura o
 *   que foi apagado procura tudo que foi apagado, vendido ou arquivado.
 *
 * SÃO TRÊS COLUNAS COM TRÊS SIGNIFICADOS (D19), e é por isso que são três
 * vistas: um ativo vendido é fato contábil, um arquivado é decisão operacional
 * reversível, e um na lixeira é erro de digitação.
 *
 * `deletedAt` explícito faz a extension de soft delete sair do caminho — é
 * assim que a lixeira alcança as linhas apagadas sem um segundo cliente Prisma.
 *
 * `statusIdExplicito` é a única concessão, e ela fecha uma armadilha real: os
 * contadores do cabeçalho viraram filtro clicável (`?statusId=`), e clicar no
 * contador de um status arquivado abriria uma lista VAZIA — um filtro que o
 * próprio sistema ofereceu e que não devolve nada. Pedir um status pelo id é
 * dizer que se quer aquele status, inclusive se ele for de arquivo.
 */
function whereDaVista(view: AssetView, statusIdExplicito: boolean): Prisma.AssetWhereInput {
  if (view === 'trashed') return { deletedAt: { not: null } };
  if (view === 'retired') return { retiredAt: { not: null } };
  if (view === 'archived') return { retiredAt: null, status: { type: $Enums.StatusLabelType.ARCHIVED } };

  return statusIdExplicito
    ? { retiredAt: null }
    : { retiredAt: null, status: { type: { not: $Enums.StatusLabelType.ARCHIVED } } };
}

/**
 * Vista + filtros de coluna + relatório, tudo que NÃO é a busca textual.
 *
 * Fica separado de `buildAssetWhere` porque os dois se somam por espalhamento
 * no use-case e nenhuma chave se repete entre eles (`OR` de um lado, colunas do
 * outro) — juntar os dois numa função só obrigaria `list-asset-options` a
 * inventar filtros que ele não tem.
 */
export function buildAssetFilterWhere(filtros: AssetFilters): Prisma.AssetWhereInput {
  const camposCustomizados = Object.entries(filtros.cf);

  return {
    ...whereDaVista(filtros.view, filtros.statusId !== undefined),
    ...(filtros.statusId ? { statusId: filtros.statusId } : {}),
    ...(filtros.locationId ? { locationId: filtros.locationId } : {}),
    ...(filtros.relatorio === 'posto-vago' ? POSTO_VAGO : {}),

    // ── IGUALDADE DENTRO DO JsonB (F9, D63) ────────────────────────────────
    //
    // `AND` e não espalhamento: duas chaves `customFields` no mesmo objeto se
    // sobrescreveriam, e filtrar por dois campos customizados de uma vez
    // aplicaria só o último — em silêncio.
    //
    // ⚠️ ESTE FILTRO NÃO USA O ÍNDICE GIN, E É MEDIDO. O Prisma tipado emite
    //
    //     WHERE ("customFields" #> ARRAY['ip_fixo']::text[])::jsonb = $1
    //
    // que é comparação de EXPRESSÃO: Seq Scan. O que o GIN serve é `@>`:
    //
    //     WHERE "customFields" @> '{"ip_fixo":"10.0.0.7"}'
    //
    // Medido em 50 mil linhas: 13,5 ms na forma do Prisma contra 0,63 ms com
    // `@>` (Bitmap Index Scan). Vinte vezes, crescendo linearmente com a tabela.
    //
    // E ele fica assim mesmo, porque a alternativa é pior: `@>` só se alcança por
    // `$queryRaw`, e este `where` se SOMA a vista, status, localização, busca,
    // ordenação e paginação — um pré-filtro cru devolveria uma lista de ids que
    // viraria um `IN` sem teto, ou uma segunda paginação que mentiria no `total`.
    // As perguntas de tabela inteira, que não precisam compor, DESCEM para SQL
    // cru e usam o índice (`count-assets-with-field.usecase.ts`).
    //
    // **É este o número que a F10 herda** (D63): o report builder vai querer
    // filtrar, ordenar e agrupar por campo customizado, e o que esta fase lhe
    // entrega é a medida, não uma promessa.
    ...(camposCustomizados.length > 0
      ? {
        AND: camposCustomizados.map(([slug, valor]) => ({
          customFields: { path: [slug], equals: valor },
        })),
      }
      : {}),
  };
}
