import { prisma } from '../../../core/database/prismaClient';
import { recordActivity } from '../../activity/use-cases/record-activity.usecase';
import { buildSnapshot } from '../../shared/diff.helper';
import { comSaldo } from '../helpers/stock-balance.helper';
import type { StockKindSpec } from '../helpers/stock-kind.helper';
import { assertReferenciasDoItem } from './assert-stock-references.usecase';
import type { ItemComSaldo, ItemDeEstoque } from './list-stock.usecase';

/**
 * O cadastro de um item de estoque. Um CRUD para os três tipos.
 *
 * A `qty` inicial ENTRA aqui, e só aqui: é o único momento em que a quantidade
 * é atributo digitável, porque é a carga inicial do item. Daí em diante ela é
 * consequência de movimentação, e quem a muda é `adjust-quantity` — por isso a
 * chave não existe no schema de edição.
 *
 * NÃO nasce um `StockLog` de abertura. A criação já está no `ActivityLog` com a
 * `qty` no retrato, e uma linha de "delta = qty inicial" no log de movimentação
 * diria o mesmo fato num segundo lugar — que é a duplicação que o D34 recusa
 * uma camada acima.
 */
export async function createStockItem(
  spec: StockKindSpec,
  data: Record<string, unknown>,
  actorId: string | null,
): Promise<ItemComSaldo> {
  const criado = await prisma.$transaction(async (tx) => {
    await assertReferenciasDoItem(tx, spec, data);

    const item = await spec.delegate(tx).create({
      data: { ...data, createdById: actorId, updatedById: actorId },
      select: spec.select,
    }) as ItemDeEstoque;

    await recordActivity(tx, {
      entityType: spec.entityType,
      entityId: item.id,
      action: 'CREATE',
      // O retrato dos campos auditados, pela mesma normalização do diff — é o
      // que faz `Decimal` sair como string aqui e ali pelo mesmo caminho.
      changes: buildSnapshot(item, spec.audited),
    }, actorId);

    return item;
  });

  // Item recém-criado não tem saída nenhuma; o saldo é a `qty` inteira. A conta
  // sai do mesmo helper assim mesmo, para a resposta ter exatamente a forma que
  // a listagem tem — uma tela que recebe `disponivel` em GET e não em POST é
  // uma tela com dois caminhos de renderização.
  return comSaldo(criado, 0);
}
