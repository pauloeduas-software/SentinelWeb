import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { recordAudit } from '../../audit/use-cases/record-audit.usecase';
import type { Ator } from '../../audit/audit.types';
import { comSaldo, contarForaDe } from '../helpers/stock-balance.helper';
import { STOCK_ITEM_SELECT } from '../helpers/stock-select.helper';
import { assertNomeLivre } from './create-stock-item.usecase';

/**
 * Restaura da lixeira.
 *
 * O índice único do nome é PARCIAL (só entre os vivos), então o nome pode ter
 * sido reaproveitado enquanto este item estava na lixeira. Restaurar às cegas
 * estouraria uma violação de unicidade crua vinda do banco.
 */
export async function restoreStockItem(id: string, ator: Ator) {
  return prisma.$transaction(async (tx) => {
    const naLixeira = await tx.stockItem.findFirst({
      where: { id, deletedAt: { not: null } },
      select: { name: true },
    });
    if (!naLixeira) throw new AppError('Item não está na lixeira.', 404);

    await assertNomeLivre(tx, naLixeira.name, id);

    // O `count` decide, não a leitura de cima: duas restaurações ao mesmo tempo
    // leem as duas "na lixeira", e a segunda não restaura nada — sem a conferência,
    // ela gravaria um segundo RESTORE.
    const { count } = await tx.stockItem.updateMany({ where: { id, deletedAt: { not: null } }, data: { deletedAt: null } });
    if (count === 0) throw new AppError('Item não está na lixeira.', 404);
    await recordAudit(tx, { entityType: 'StockItem', entityId: id, entityLabel: naLixeira.name, action: 'RESTORE' }, ator);

    const item = await tx.stockItem.findFirstOrThrow({ where: { id }, select: STOCK_ITEM_SELECT });
    // Zero por construção — item só vai para a lixeira sem unidade fora —, mas
    // contado, não afirmado: é a mesma função que o resto usa.
    return comSaldo(item, await contarForaDe(tx, id));
  });
}
