import { prisma } from '../../../core/database/prismaClient';
import { buildUserWhere } from '../helpers/user-filters.helper';

// Mesmo teto e mesma forma do `/options` do catálogo: id e nome, sem envelope.
const MAX_OPCOES = 200;

export interface UserOption {
  id: string;
  name: string;
}

/**
 * Lista enxuta de colaboradores para `<select>` — hoje o seletor de gestor da
 * localização; na F4, o de responsável pelo ativo.
 *
 * A lixeira é respeitada sozinha: `User` tem `deletedAt` e a extension escopa
 * toda consulta de topo (core/database/soft-delete.extension.ts).
 */
export async function listUserOptions(q?: string): Promise<UserOption[]> {
  return prisma.user.findMany({
    where: buildUserWhere(q),
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
    take: MAX_OPCOES,
  });
}
