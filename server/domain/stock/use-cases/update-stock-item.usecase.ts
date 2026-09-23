import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { recordActivity } from '../../activity/use-cases/record-activity.usecase';
import { buildChanges } from '../../shared/diff.helper';
import { comSaldo, contarEmUsoDe } from '../helpers/stock-balance.helper';
import type { StockKindSpec } from '../helpers/stock-kind.helper';
import { assertReferenciasDoItem } from './assert-stock-references.usecase';
import type { ItemComSaldo, ItemDeEstoque } from './list-stock.usecase';

/**
 * A edição — tudo menos a quantidade.
 *
 * `data` chega já validado por um `strictObject` que NÃO declara `qty`
 * (`schemas/stock.schema.ts`), então não há nada a filtrar aqui: um corpo com
 * `qty` foi recusado com 422 antes de chegar. Escrever um `delete data.qty`
 * neste arquivo seria a segunda defesa que faz a primeira parecer opcional.
 */
export async function updateStockItem(
  spec: StockKindSpec,
  id: string,
  data: Record<string, unknown>,
  actorId: string | null,
): Promise<ItemComSaldo> {
  const item = await prisma.$transaction(async (tx) => {
    const delegate = spec.delegate(tx);

    const antes = await delegate.findFirst({ where: { id }, select: spec.select });
    if (!antes) throw new AppError(`Nenhum ${spec.rotulo} com este identificador.`, 404);

    await assertReferenciasDoItem(tx, spec, data);

    const depois = await delegate.update({
      where: { id },
      data: { ...data, updatedById: actorId },
      select: spec.select,
    }) as ItemDeEstoque;

    // Só o que REALMENTE mudou vai para o log: gravar o registro inteiro a cada
    // edição transformaria o histórico em cópia da tabela.
    const changes = buildChanges(antes, depois, spec.audited);
    if (Object.keys(changes).length > 0) {
      await recordActivity(tx, {
        entityType: spec.entityType,
        entityId: id,
        action: 'UPDATE',
        changes,
      }, actorId);
    }

    return depois;
  });

  return comSaldo(item, await contarEmUsoDe(prisma, spec.kind, id));
}
