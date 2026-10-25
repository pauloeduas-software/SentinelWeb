import type { Prisma } from '@prisma/client';
import { prisma } from '../../../core/database/prismaClient';
import { contemTexto } from '../../shared/busca.helper';
import type { ListEnvelope, ListQuery } from '../../../core/http/list-query';
import { comSaldo, contarFora, type ComSaldo } from '../helpers/stock-balance.helper';
import { STOCK_ITEM_SELECT } from '../helpers/stock-select.helper';
import type { StockFilters } from '../schemas/stock.schema';


type StockItemRow = Prisma.StockItemGetPayload<{ select: typeof STOCK_ITEM_SELECT }>;
type StockItemComSaldo = ComSaldo<StockItemRow>;

/**
 * A listagem, com o saldo de cada linha calculado em LOTE.
 *
 * `?view=trashed` lista a lixeira: a chave `deletedAt` no `where` é o que tira a
 * consulta do escopo automático da extension — presente, ela vale o que diz.
 *
 * `$transaction` para a contagem e a página saírem do MESMO instante, como na
 * listagem de ativos; o saldo vem depois, fora dela, porque é leitura que não
 * precisa da garantia.
 */
export async function listStock(
  query: ListQuery,
  filtros: StockFilters,
): Promise<ListEnvelope<StockItemComSaldo>> {
  const where: Prisma.StockItemWhereInput = {
    ...(query.view === 'trashed' ? { deletedAt: { not: null } } : {}),
    ...(query.q ? { name: contemTexto(query.q) } : {}),
    ...(filtros.categoryId ? { categoryId: filtros.categoryId } : {}),
  };

  const [total, rows] = await prisma.$transaction([
    prisma.stockItem.count({ where }),
    prisma.stockItem.findMany({
      where,
      select: STOCK_ITEM_SELECT,
      orderBy: { name: 'asc' },
      skip: query.skip,
      take: query.take,
    }),
  ]);

  const fora = await contarFora(prisma, rows.map((item) => item.id));
  return { total, rows: rows.map((item) => comSaldo(item, fora.get(item.id) ?? 0)) };
}
