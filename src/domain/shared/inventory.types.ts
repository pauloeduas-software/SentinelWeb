import type { User } from './user.types';

/** Ativo cadastrado à mão — o lado ITAM. */
export interface InventoryItem {
  id: string;
  name: string;
  description?: string | null;
  quantity: number;
  category: string;
  status: string;
  assignedToId?: string | null;
  assignedTo?: User | null;
  notes?: string | null;
  createdAt: string;
}

export const INVENTORY_STATUSES = ['AVAILABLE', 'DEPLOYED', 'BROKEN'] as const;
export type InventoryStatus = (typeof INVENTORY_STATUSES)[number];
