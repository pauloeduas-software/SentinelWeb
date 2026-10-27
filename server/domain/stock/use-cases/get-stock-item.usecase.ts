import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { comContagem, contarUsoDe } from '../helpers/stock-balance.helper';
import { STOCK_ITEM_SELECT } from '../helpers/stock-select.helper';

/**
 * UM item, com a conta. Quem está com ele mora em `listStockCheckouts`, e o que
 * já aconteceu em `listStockHistory` — as duas listas do detalhe, paginadas,
 * como as da licença.
 */
export async function getStockItem(id: string) {
  const item = await prisma.stockItem.findUnique({ where: { id }, select: STOCK_ITEM_SELECT });
  if (!item) throw new AppError('Item de estoque não encontrado.', 404);
  return comContagem(item, await contarUsoDe(prisma, id));
}
