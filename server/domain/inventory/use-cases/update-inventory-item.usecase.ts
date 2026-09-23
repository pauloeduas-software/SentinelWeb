import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { buildChanges } from '../../shared/diff.helper';
import { recordActivity } from '../../activity/use-cases/record-activity.usecase';
import { INVENTORY_ITEM_SELECT } from '../helpers/inventory-select.helper';

// Campos que o formulário edita. Explícito de propósito: a rota antiga montava
// o `data` do Prisma direto do corpo da requisição.
export interface UpdateInventoryItemData {
  name?: string;
  category?: string;
  description?: string | null;
  quantity?: number;
  status?: string;
  notes?: string | null;
}

// Campos auditados. Lista explícita para o diff não comparar `assignedTo`, que é
// objeto aninhado e difere de si mesmo no `===`.
const CAMPOS_AUDITADOS = ['name', 'category', 'description', 'quantity', 'status', 'notes'] as const;

export async function updateInventoryItem(id: string, data: UpdateInventoryItemData) {
  return prisma.$transaction(async (tx) => {
    const antes = await tx.inventoryItem.findFirst({ where: { id }, select: INVENTORY_ITEM_SELECT });
    if (!antes) throw new AppError('Registro não encontrado', 404);

    const depois = await tx.inventoryItem.update({
      where: { id },
      data: {
        name: data.name,
        category: data.category,
        description: data.description,
        // `undefined` mantém o valor atual; a rota antiga fazia Number(undefined)
        // e gravava NaN quando o campo não vinha no corpo
        quantity: data.quantity,
        status: data.status,
        notes: data.notes,
      },
      select: INVENTORY_ITEM_SELECT,
    });

    const changes = buildChanges(antes, depois, CAMPOS_AUDITADOS);
    // Salvar sem mudar nada não vira linha no histórico: o Activity Report
    // encheria de ruído e "o que mudou" ficaria difícil de achar.
    if (Object.keys(changes).length > 0) {
      await recordActivity(tx, { entityType: 'InventoryItem', entityId: id, action: 'UPDATE', changes });
    }

    return depois;
  });
}
