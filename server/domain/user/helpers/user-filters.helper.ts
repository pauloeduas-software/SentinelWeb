import type { Prisma } from '@prisma/client';
import type { ListView } from '../../../core/http/list-query';

export const USER_SORTABLE = ['name', 'email', 'department', 'createdAt'] as const;
export type UserSortable = (typeof USER_SORTABLE)[number];

export function buildUserWhere(q?: string): Prisma.UserWhereInput {
  if (!q) return {};

  return {
    OR: [
      { name: { contains: q, mode: 'insensitive' } },
      { email: { contains: q, mode: 'insensitive' } },
      { department: { contains: q, mode: 'insensitive' } },
    ],
  };
}

// `deletedAt` explícito faz a extension de soft delete sair do caminho (ver
// core/database/soft-delete.extension.ts): é assim que a lixeira alcança as
// linhas apagadas sem um segundo cliente Prisma.
export function buildTrashWhere(view: ListView): Prisma.UserWhereInput {
  return view === 'trashed' ? { deletedAt: { not: null } } : {};
}
