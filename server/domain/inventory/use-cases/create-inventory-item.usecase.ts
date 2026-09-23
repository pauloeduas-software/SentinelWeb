import { prisma } from '../../../core/database/prismaClient';
import { recordActivity } from '../../activity/use-cases/record-activity.usecase';
import { INVENTORY_ITEM_SELECT } from '../helpers/inventory-select.helper';

export interface CreateInventoryItemData {
  name: string;
  category: string;
  description?: string | null;
  quantity?: number;
  status?: string;
  notes?: string | null;
}

export async function createInventoryItem(data: CreateInventoryItemData) {
  // O log entra na MESMA transação da gravação: fora dela, o histórico
  // registraria um cadastro que depois falhou.
  return prisma.$transaction(async (tx) => {
    const item = await tx.inventoryItem.create({
      data: {
        name: data.name,
        category: data.category,
        description: data.description ?? null,
        quantity: data.quantity ?? 1,
        status: data.status ?? 'AVAILABLE',
        notes: data.notes ?? null,
      },
      select: INVENTORY_ITEM_SELECT,
    });

    await recordActivity(tx, {
      entityType: 'InventoryItem',
      entityId: item.id,
      action: 'CREATE',
      changes: { name: item.name, category: item.category, quantity: item.quantity, status: item.status },
    });

    return item;
  });
}
