import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { contemTexto } from '../../shared/busca.helper';

// Sem diferença de maiúscula — buscar "latitude" acha "Latitude" — e com os
// curingas escapados (`contemTexto`). A busca alcança o modelo e o fabricante porque é assim que se
// procura um ativo na prática — "o Dell do fulano", não a etiqueta decorada.
export function buildAssetWhere(q?: string): Prisma.AssetWhereInput {
  if (!q) return {};

  const contem = contemTexto(q);

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
// no `core`. "Baixado" é `retiredAt IS NOT NULL`, e só existe no ITAM.
// Pôr isso em `core/http/list-query.ts` seria fazer a infraestrutura conhecer
// negócio, que é o que a seta `pages → domain → core` proíbe e o lint reprova.
//
// A consequência prática: a vista do ATIVO é parseada AQUI, inteira, e o
// controller entrega ao parser genérico só o que sobrou (página e busca).
// Uma vista, um lugar — traduzir `retired` para `active` antes do `core` e
// guardar a real aqui deixaria duas verdades sobre a mesma chave.

const ASSET_VIEWS = ['active', 'trashed', 'retired'] as const;
export type AssetView = (typeof ASSET_VIEWS)[number];

export interface AssetFilters {
  view: AssetView;
  statusId?: string;
  categoryId?: string;
}

/**
 * ENTREGUE A UM POSTO DE TRABALHO — posse aberta cujo alvo é um posto.
 *
 * É o recorte que a listagem padrão EXCLUI: o equipamento que está numa mesa
 * tem endereço, e o endereço dele é a mesa. Quem pergunta "o que há no parque"
 * quer o que está em estoque ou com gente; o que está montado num posto se
 * pergunta em `/postos`, onde ele aparece junto dos ocupantes que respondem por
 * ele. Sem isto, o mesmo computador aparece nas duas telas e nenhuma das duas
 * responde uma pergunta inteira. O ativo GUARDADO no depósito ou na sala de
 * reunião (`locationId`) não é entregue a ninguém e continua sendo parque.
 *
 * FILTRO DO PRISMA, nunca `.filter()` depois da consulta: filtrando no cliente,
 * a página 1 mostraria 3 de 25 linhas e o `total` do envelope mentiria — a
 * paginação inteira passa a descrever um conjunto que a tela não está vendo.
 */
export const EM_POSTO_DE_TRABALHO: Prisma.AssetWhereInput = {
  assignments: {
    some: {
      checkinAt: null,
      targetType: 'WORKSTATION',
    },
  },
};

// `z.object`, e NÃO `strictObject`: aqui só se lê o que é do domínio e o resto
// (page, perPage, q) segue intacto para o parser do `core`, que é
// estrito e continua recusando typo em chave dele.
const assetFiltersSchema = z.object({
  view: z.enum(ASSET_VIEWS, `vista inválida: use ${ASSET_VIEWS.join(', ')}`).default('active'),
  statusId: z.uuid('status: identificador inválido').optional(),
  categoryId: z.uuid('categoria: identificador inválido').optional(),
});

/** Derivada do schema para as duas listas não divergirem quando entrar um filtro novo. */
const CHAVES_DO_DOMINIO = Object.keys(assetFiltersSchema.shape);

/**
 * Parte a query da listagem em duas: o que só o ITAM entende e o que o parser
 * genérico do `core` entende.
 *
 * Precisa acontecer ANTES do `parseListQuery`: ele valida com `strictObject` e
 * responderia 422 a `?statusId=` — a mesma proteção que pega `?pag=2`.
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
 * O `where` das TRÊS vistas.
 *
 * - `active` **exclui** o baixado (`retiredAt`), que saiu do
 *   PATRIMÔNIO e continua existindo porque baixa é fato contábil que não se
 *   apaga.
 * - `retired` mostra **só** ele.
 * - `trashed` é a lixeira e não olha `retiredAt`: quem procura o que foi
 *   apagado procura tudo que foi apagado, vendido ou não.
 *
 * SÃO DUAS COLUNAS COM DOIS SIGNIFICADOS (D19): um ativo vendido é fato
 * contábil, e um na lixeira é erro de digitação.
 *
 * `deletedAt` explícito faz a extension de soft delete sair do caminho — é
 * assim que a lixeira alcança as linhas apagadas sem um segundo cliente Prisma.
 *
 * O `NOT` do posto mantém o contador do cabeçalho batendo com a tabela, porque
 * o `/stats` exclui o mesmo conjunto: o computador do posto é pergunta de
 * `/postos`.
 */
function whereDaVista(view: AssetView): Prisma.AssetWhereInput {
  if (view === 'trashed') return { deletedAt: { not: null } };
  if (view === 'retired') return { retiredAt: { not: null } };
  return { retiredAt: null, NOT: EM_POSTO_DE_TRABALHO };
}

/**
 * Vista + filtros de coluna, tudo que NÃO é a busca textual.
 *
 * Fica separado de `buildAssetWhere` porque os dois se somam por espalhamento
 * no use-case e nenhuma chave se repete entre eles (`OR` de um lado, colunas do
 * outro) — juntar os dois numa função só obrigaria `list-asset-options` a
 * inventar filtros que ele não tem.
 */
export function buildAssetFilterWhere(filtros: AssetFilters): Prisma.AssetWhereInput {
  return {
    ...whereDaVista(filtros.view),
    ...(filtros.statusId ? { statusId: filtros.statusId } : {}),
    // Pelo MODELO: o ativo não tem `categoryId`, a categoria dele é a do modelo.
    ...(filtros.categoryId ? { model: { categoryId: filtros.categoryId } } : {}),
  };
}
