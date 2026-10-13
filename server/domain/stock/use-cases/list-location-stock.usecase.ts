import { prisma } from '../../../core/database/prismaClient';
import { STOCK_UNIT_SELECT } from '../helpers/stock-select.helper';

/**
 * As unidades de estoque FORA, entregues a este posto — uma linha por unidade,
 * como a ficha do posto as mostra: o item, a categoria, desde quando.
 *
 * Consulta na movimentação, e não no item, de propósito: a pergunta é "o que
 * está nesta mesa", e a resposta são as saídas abertas. O item na lixeira vem
 * junto (`item.deletedAt` sai no select): a unidade continua na mesa, e a ficha
 * precisa mostrá-la para alguém devolvê-la — é a condição para o item poder
 * ser apagado.
 */
export async function listLocationStock(locationId: string) {
  return prisma.stockMovement.findMany({
    where: { targetLocationId: locationId, kind: 'SAIDA', returnedAt: null },
    select: STOCK_UNIT_SELECT,
    // Agrupadas por item e, dentro dele, na ordem em que saíram.
    orderBy: [{ item: { name: 'asc' } }, { createdAt: 'asc' }],
  });
}

/** O mesmo, para a PESSOA: as unidades no nome dela. */
export async function listUserStock(userId: string) {
  return prisma.stockMovement.findMany({
    where: { targetUserId: userId, kind: 'SAIDA', returnedAt: null },
    select: STOCK_UNIT_SELECT,
    orderBy: [{ item: { name: 'asc' } }, { createdAt: 'asc' }],
  });
}
