import { prisma } from '../../../infra/database/prismaClient';
import { AppError } from '../../../infra/errors/app-error';
import { comContagem, contarUsoDe } from '../helpers/stock-balance.helper';
import { agruparPorLote } from '../helpers/stock-lote.helper';
import { STOCK_ITEM_SELECT } from '../helpers/stock-select.helper';

/**
 * UM item, com a conta. Quem está com ele mora em `listStockCheckouts`, e o que
 * já aconteceu em `listStockHistory` — as duas listas do detalhe, paginadas,
 * como as da licença.
 *
 * `entregasAbertas` é o número da aba Responsáveis: as linhas da lista sem busca,
 * agrupadas pelo mesmo `agruparPorLote`, para o número nunca divergir dela. Vem
 * aqui, e não do total da lista, porque a lista aberta por um link já chega filtrada.
 */
export async function getStockItem(id: string) {
  const item = await prisma.stockItem.findUnique({ where: { id }, select: STOCK_ITEM_SELECT });
  if (!item) throw new AppError('Item de estoque não encontrado.', 404);

  const [uso, abertas] = await Promise.all([
    contarUsoDe(prisma, id),
    prisma.stockMovement.findMany({
      where: { itemId: id, returnedAt: null },
      select: {
        id: true, itemId: true, createdAt: true, targetType: true,
        targetPersonId: true, targetWorkstationId: true, targetWorkstationName: true, targetAssetId: true,
      },
    }),
  ]);
  return { ...comContagem(item, uso), entregasAbertas: agruparPorLote(abertas).length };
}
