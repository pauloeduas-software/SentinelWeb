import type { Prisma } from '@prisma/client';
import type { ListView } from '../../../core/http/list-query';

// A ALLOWLIST DE ORDENAÇÃO.
export const USER_SORTABLE = ['name', 'email', 'createdAt'] as const;
export type UserSortable = (typeof USER_SORTABLE)[number];

export function buildUserWhere(q?: string): Prisma.UserWhereInput {
  if (!q) return {};

  return {
    OR: [
      { name: { contains: q, mode: 'insensitive' } },
      { email: { contains: q, mode: 'insensitive' } },
      // A MATRÍCULA entra junto (F11, Etapa E): é por ela que o RH procura
      // alguém, e é o que vem no crachá.
      { employeeNumber: { contains: q, mode: 'insensitive' } },
      { jobTitle: { contains: q, mode: 'insensitive' } },
    ],
  };
}

// `deletedAt` explícito faz a extension de soft delete sair do caminho (ver
// core/database/soft-delete.extension.ts): é assim que a lixeira alcança as
// linhas apagadas sem um segundo cliente Prisma.
export function buildTrashWhere(view: ListView): Prisma.UserWhereInput {
  return view === 'trashed' ? { deletedAt: { not: null } } : {};
}
