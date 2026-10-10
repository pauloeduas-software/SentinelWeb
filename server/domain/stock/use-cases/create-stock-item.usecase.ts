import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { recordActivity } from '../../activity/use-cases/record-activity.usecase';
import { buildSnapshot } from '../../shared/diff.helper';
import type { ClienteEstoque } from '../helpers/stock-balance.helper';
import { STOCK_ITEM_SELECT } from '../helpers/stock-select.helper';
import type { CreateStockItemInput } from '../schemas/stock.schema';

const CAMPOS_AUDITADOS = ['name', 'qty', 'categoryId', 'notes'] as const;

/**
 * A categoria do item tem que ser do tipo ESTOQUE.
 *
 * O banco não impede — a FK aceita qualquer categoria —, e é o `type` que
 * separa: um item de estoque numa categoria de ATIVO é o mesmo erro que "Em
 * Uso" tipado DEPLOYABLE foi na F1. 422 e não 404: a categoria existe, o tipo
 * dela é que não serve.
 */
export async function assertCategoriaDeEstoque(client: ClienteEstoque, categoryId: string): Promise<void> {
  const categoria = await client.category.findUnique({ where: { id: categoryId }, select: { type: true } });
  if (!categoria) throw new AppError('Categoria não encontrada.', 404);
  if (categoria.type !== 'STOCK') {
    throw new AppError('A categoria de um item de estoque precisa ser do tipo Estoque.', 422, { type: categoria.type });
  }
}

/**
 * O nome é único entre os vivos (índice parcial). Conferir antes é o que
 * transforma o P2002 cru num 409 que diz o nome — e que deixa o item da lixeira
 * fora da conta, porque é ela que pode ser restaurada.
 */
export async function assertNomeLivre(client: ClienteEstoque, name: string, ignorarId?: string): Promise<void> {
  const outro = await client.stockItem.findFirst({
    where: { name, ...(ignorarId ? { id: { not: ignorarId } } : {}) },
    select: { id: true },
  });
  if (outro) throw new AppError(`Já existe um item de estoque chamado "${name}".`, 409);
}

export async function createStockItem(data: CreateStockItemInput, actorId: string | null) {
  return prisma.$transaction(async (tx) => {
    await assertCategoriaDeEstoque(tx, data.categoryId);
    await assertNomeLivre(tx, data.name);

    const item = await tx.stockItem.create({
      data: {
        name: data.name,
        categoryId: data.categoryId,
        qty: data.qty,
        notes: data.notes ?? null,
        createdById: actorId,
        updatedById: actorId,
      },
      select: STOCK_ITEM_SELECT,
    });

    // A QUANTIDADE INICIAL É A PRIMEIRA ENTRADA. Sem esta linha, a movimentação
    // do item começaria "do nada" com 10 unidades no total e nenhum movimento
    // que as explicasse — e o total deixaria de ser a soma do que entrou.
    if (data.qty > 0) {
      await tx.stockMovement.create({
        data: { itemId: item.id, kind: 'ENTRADA', qty: data.qty, notes: 'cadastro', createdById: actorId },
      });
    }

    await recordActivity(tx, {
      entityType: 'StockItem',
      entityId: item.id,
      action: 'CREATE',
      changes: buildSnapshot(item, CAMPOS_AUDITADOS),
    }, actorId);

    return item;
  });
}
