import type { Prisma } from '@prisma/client';
import type { ListView } from '../../../core/http/list-query';

// Colunas que a listagem de inventário aceita ordenar. Allowlist do DOMÍNIO: o
// parser em core/http/list-query.ts a recebe por parâmetro, porque `core` não
// pode conhecer negócio (docs/ARQUITETURA.md).
//
// Ordenar por coluna fora desta lista responde 422 — nunca `orderBy` montado
// com string crua do cliente.
export const INVENTORY_SORTABLE = ['name', 'category', 'quantity', 'status', 'createdAt'] as const;
export type InventorySortable = (typeof INVENTORY_SORTABLE)[number];

// Função pura, sem I/O — o que a pasta `helpers/` é.
//
// `mode: 'insensitive'` é obrigatório: sem ele o Postgres compara com diferença
// de maiúscula e buscar "monitor" não acha "Monitor".
export function buildInventoryWhere(q?: string): Prisma.InventoryItemWhereInput {
  if (!q) return {};

  return {
    OR: [
      { name: { contains: q, mode: 'insensitive' } },
      { description: { contains: q, mode: 'insensitive' } },
      { category: { contains: q, mode: 'insensitive' } },
    ],
  };
}

// `deletedAt` explícito faz a extension de soft delete sair do caminho (ver
// core/database/soft-delete.extension.ts): é assim que a lixeira alcança as
// linhas apagadas sem um segundo cliente Prisma.
export function buildTrashWhere(view: ListView): Prisma.InventoryItemWhereInput {
  return view === 'trashed' ? { deletedAt: { not: null } } : {};
}
