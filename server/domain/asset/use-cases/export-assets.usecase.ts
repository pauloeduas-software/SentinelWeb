import type { Readable } from 'stream';
import { prisma } from '../../../core/database/prismaClient';
import { csvStream } from '../../shared/csv.helper';
import { resolverResponsaveisEmLote } from '../../assignment/use-cases/resolve-responsibles.usecase';
import { buildAssetFilterWhere, buildAssetWhere, type AssetFilters } from '../helpers/asset-filters.helper';
import {
  pediuCampoCustomizado, type ColunasEscolhidas, type LinhaDeExport,
} from '../helpers/asset-export-columns.helper';

// O EXPORT DA LISTAGEM DE ATIVOS (F10, Etapa C).
//
// ═════════════════════════════════════════════════════════════════════════════
// ELE USA OS MESMOS FILTROS DA TELA, E ISSO É O CONTRATO.
//
// `buildAssetWhere` + `buildAssetFilterWhere` são as MESMAS funções que
// `list-assets.usecase.ts` chama. Um `where` próprio aqui faria o arquivo
// discordar da tela que o pediu — e a pessoa descobriria isso contando linhas
// numa planilha de cinco mil.
//
// O QUE ELE NÃO HERDA DA TELA: a paginação e a ordenação.
//
//   `perPage` não vale aqui — exportar é levar TUDO que o filtro alcança, e o
//   teto de 100 do `core/http/list-query.ts` é para tabela.
//
//   A ordem é por `id`, não pela coluna que a tela está ordenando, e a razão é
//   o cursor: o Prisma exige campo ÚNICO como cursor, e `assetTag` tem
//   unicidade por índice PARCIAL (`WHERE deleted_at IS NULL`), que ele não
//   conhece. Paginar por `OFFSET` resolveria a ordem e traria os dois defeitos
//   que o cursor evita: o banco relê e descarta tudo que já foi enviado a cada
//   lote, e um cadastro no meio do export DESLIZA a janela — linha duplicada ou
//   linha perdida, sem nada acusando.
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Quantas linhas por lote.
 *
 * Mil é o equilíbrio medido pelo tamanho da resposta do Prisma, não um palpite
 * redondo: cada linha traz quatro relações (status, modelo, local, fornecedor),
 * e o lote existe para a memória do processo ser de UM lote. Mais alto, a
 * resolução de responsáveis em lote começa a montar mapas grandes; mais baixo,
 * são muitas viagens ao banco para o mesmo arquivo.
 */
const TAMANHO_DO_LOTE = 1_000;

/** O select do export: só o que as colunas da allowlist sabem ler. */
const EXPORT_SELECT = {
  id: true,
  assetTag: true,
  serial: true,
  name: true,
  notes: true,
  byod: true,
  orderNumber: true,
  purchaseDate: true,
  purchaseCost: true,
  warrantyExpiresAt: true,
  eolDate: true,
  retiredAt: true,
  retiredReason: true,
  createdAt: true,
  status: { select: { name: true } },
  model: {
    select: {
      name: true,
      manufacturer: { select: { name: true } },
      category: { select: { name: true } },
    },
  },
  location: { select: { name: true } },
  supplier: { select: { name: true } },
} as const;

export function exportAssets(
  filtros: AssetFilters,
  q: string | undefined,
  escolhidas: ColunasEscolhidas,
  delimitador: string,
): Readable {
  const { tokens, colunas } = escolhidas;
  const querResponsavel = tokens.includes('responsible');

  // O JsonB SÓ ENTRA NO SELECT QUANDO ALGUMA COLUNA `cf:` FOI PEDIDA (F9/F10).
  //
  // `customFields` é a coluna mais gorda da tabela e está FORA do select
  // compartilhado por decisão da F9 — trazê-la em todo export faria quem baixa as
  // onze colunas padrão pagar o JsonB de cinco mil ativos para descartá-lo. A
  // pergunta sai do TOKEN, igual à do responsável, e pelo mesmo motivo.
  const querCampos = pediuCampoCustomizado(tokens);

  const where = { ...buildAssetWhere(q), ...buildAssetFilterWhere(filtros) };

  return csvStream<LinhaDeExport>({
    colunas,
    delimitador,
    cursorDe: (linha) => linha.id,
    lote: async (cursor) => {
      const rows = await prisma.asset.findMany({
        where,
        select: querCampos ? { ...EXPORT_SELECT, customFields: true } : EXPORT_SELECT,
        orderBy: { id: 'asc' },
        take: TAMANHO_DO_LOTE,
        // `skip: 1` com cursor: sem ele a linha do cursor volta como primeira
        // do lote seguinte e aparece duas vezes no arquivo.
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });

      if (rows.length === 0) return [];

      // A Camada 3 por LOTE, com o mesmo resolver da tela: um por linha seria
      // N+1 sobre o parque inteiro (e cada linha custa até três consultas).
      //
      // Resolver sempre, mesmo quando a coluna de responsável não foi pedida,
      // seria desperdício — por isso o `querResponsavel`, que sai do TOKEN e
      // não do título: o custo só é pago por quem pediu a coluna.
      const posses = querResponsavel
        ? await resolverResponsaveisEmLote(prisma, rows.map((linha) => linha.id))
        : null;

      return rows.map((linha) => ({
        ...linha,
        posse: posses?.get(linha.id)
          ?? { assignmentId: null, targetType: null, targetLabel: null, responsaveis: [], postoVago: false },
      }));
    },
  });
}
