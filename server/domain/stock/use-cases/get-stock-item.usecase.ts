import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { comSaldo, contarForaDe } from '../helpers/stock-balance.helper';
import { STOCK_ITEM_SELECT, STOCK_MOVEMENT_SELECT } from '../helpers/stock-select.helper';

/**
 * UM item: a linha com o saldo e as unidades que estão FORA — para quem, desde
 * quando. É daqui que sai o botão Devolver de cada unidade na ficha do item.
 *
 * `findFirst` pelo escopo da lixeira: item apagado responde 404 por esta porta,
 * e a lixeira se lê pela listagem com `?view=trashed`.
 */
export async function getStockItem(id: string) {
  const item = await prisma.stockItem.findFirst({ where: { id }, select: STOCK_ITEM_SELECT });
  if (!item) throw new AppError('Item de estoque não encontrado.', 404);

  const [fora, unidadesFora] = await Promise.all([
    contarForaDe(prisma, id),
    prisma.stockMovement.findMany({
      where: { itemId: id, kind: 'SAIDA', returnedAt: null },
      select: STOCK_MOVEMENT_SELECT,
      // As mais antigas primeiro: é a ordem em que saíram, e a que a tela usa
      // para devolver "a primeira que saiu". `id` desempata as N de uma mesma
      // saída, que nascem no mesmo milissegundo.
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      // Teto: `fora` (a contagem) é a verdade; a lista é o que cabe na tela.
      take: 200,
    }),
  ]);

  return { ...comSaldo(item, fora), unidadesFora };
}
