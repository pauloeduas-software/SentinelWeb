import type { Prisma } from '@prisma/client';
import { contemTexto } from '../../shared/busca.helper';

export function buildUserWhere(q?: string): Prisma.UserWhereInput {
  if (!q) return {};

  return {
    OR: [
      { name: contemTexto(q) },
      { email: contemTexto(q) },
    ],
  };
}
