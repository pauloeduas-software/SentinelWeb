import type { Prisma } from '@prisma/client';

export function buildUserWhere(q?: string): Prisma.UserWhereInput {
  if (!q) return {};

  return {
    OR: [
      { name: { contains: q, mode: 'insensitive' } },
      { email: { contains: q, mode: 'insensitive' } },
    ],
  };
}
