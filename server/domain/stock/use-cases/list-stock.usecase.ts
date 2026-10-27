import type { Prisma } from '@prisma/client';
import { prisma } from '../../../core/database/prismaClient';
import { contemTexto } from '../../shared/busca.helper';
import type { ListEnvelope, ListQuery } from '../../../core/http/list-query';
import { comContagem, contarUso, SEM_USO, type ComContagem } from '../helpers/stock-balance.helper';
import { STOCK_ITEM_SELECT } from '../helpers/stock-select.helper';
import type { StockFilters } from '../schemas/stock.schema';

type StockItemRow = Prisma.StockItemGetPayload<{ select: typeof STOCK_ITEM_SELECT }>;
export type ItemComContagem = ComContagem<StockItemRow>;

/**
 * A LISTAGEM, com a conta de cada linha calculada em LOTE.
 *
 * UMA LISTA SÓ, ativos e desativados juntos, pelo nome — o padrão das
 * Configurações: o desativado continua na lista, e a tela o esmaece e marca.
 */
export async function listStock(
  query: ListQuery,
  filtros: StockFilters,
): Promise<ListEnvelope<ItemComContagem>> {
  // `AND`, e não espalhamento: a busca escreve `OR`, e espalhada ela apagaria
  // outro `OR` em silêncio.
  const where: Prisma.StockItemWhereInput = {
    AND: [
      buildBuscaWhere(query.q),
      filtros.categoryId ? { categoryId: filtros.categoryId } : {},
    ],
  };

  const [total, rows] = await Promise.all([
    prisma.stockItem.count({ where }),
    prisma.stockItem.findMany({
      where,
      select: STOCK_ITEM_SELECT,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      skip: query.skip,
      take: query.take,
    }),
  ]);

  const uso = await contarUso(prisma, rows.map((item) => item.id));
  return { total, rows: rows.map((item) => comContagem(item, uso.get(item.id) ?? SEM_USO)) };
}

/**
 * O `where` da busca `?q=`. Varre também o nome da CATEGORIA e da LOCALIZAÇÃO,
 * que não são colunas desta tabela: é assim que se procura estoque na prática —
 * "os cabos", "o que está no Depósito" —, como a licença procura pelo fabricante.
 */
function buildBuscaWhere(q?: string): Prisma.StockItemWhereInput {
  if (!q) return {};
  const contem = contemTexto(q);
  return {
    OR: [
      { name: contem },
      { category: { name: contem } },
      { location: { name: contem } },
    ],
  };
}
