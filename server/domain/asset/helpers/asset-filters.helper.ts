import { z } from 'zod';
import { $Enums, type Prisma } from '@prisma/client';

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
}

/**
 * ATIVO EM POSTO VAGO — equipamento parado em mesa sem ninguém.
 *
 * Posse ABERTA (`checkinAt: null`) cujo alvo é uma localização **sem nenhum
 * ocupante aberto**. É o sinal que nenhum ITAM de prateleira dá, e o candidato
 * natural a voltar para o estoque (docs/MODELO-POSSE.md).
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
  const filtros = assetFiltersSchema.parse(query);

  for (const chave of CHAVES_DO_DOMINIO) delete query[chave];

  return { filtros, paraOCore: query };
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
  return {
    ...whereDaVista(filtros.view, filtros.statusId !== undefined),
    ...(filtros.statusId ? { statusId: filtros.statusId } : {}),
    ...(filtros.locationId ? { locationId: filtros.locationId } : {}),
    ...(filtros.relatorio === 'posto-vago' ? POSTO_VAGO : {}),
  };
}
