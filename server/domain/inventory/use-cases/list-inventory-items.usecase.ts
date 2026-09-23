import { prisma } from '../../../core/database/prismaClient';
import type { ListEnvelope, ListQuery } from '../../../core/http/list-query';
import { INVENTORY_ITEM_SELECT } from '../helpers/inventory-select.helper';
import { buildInventoryWhere, buildTrashWhere, type InventorySortable } from '../helpers/inventory-filters.helper';

type InventoryRow = Awaited<ReturnType<typeof buscarPagina>>[number];

function buscarPagina(where: object, query: ListQuery<InventorySortable>) {
  return prisma.inventoryItem.findMany({
    where,
    select: INVENTORY_ITEM_SELECT,
    orderBy: { [query.sort]: query.order },
    skip: query.skip,
    take: query.take,
  });
}

export async function listInventoryItems(
  query: ListQuery<InventorySortable>,
): Promise<ListEnvelope<InventoryRow>> {
  const where = { ...buildInventoryWhere(query.q), ...buildTrashWhere(query.view) };

  // `$transaction` para a contagem e a página saírem do MESMO instante: em duas
  // consultas soltas, um cadastro entre uma e outra faz o total não bater com o
  // que a página mostra.
  const [total, rows] = await prisma.$transaction([
    prisma.inventoryItem.count({ where }),
    buscarPagina(where, query),
  ]);

  return { total, rows };
}
