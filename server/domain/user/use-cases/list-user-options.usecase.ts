import { prisma } from '../../../core/database/prismaClient';
import { buildUserWhere } from '../helpers/user-filters.helper';

// Mesmo teto e mesma forma do `/options` do catálogo: id e nome, sem envelope.
const MAX_OPCOES = 200;

interface UserOption {
  id: string;
  name: string;
}

/**
 * Lista enxuta de colaboradores para `<select>` — os seletores de pessoa da
 * entrega de ativo, de assento, de estoque e da ocupação de posto.
 *
 * Só os ATIVOS, como o `/options` do catálogo: desativado não recebe entrega
 * nem ocupa posto, e oferecê-lo no seletor era convidar ao 409.
 *
 * A lixeira é respeitada sozinha: `User` tem `deletedAt` e a extension escopa
 * toda consulta de topo (core/database/soft-delete.extension.ts).
 */
export async function listUserOptions(q?: string): Promise<UserOption[]> {
  return prisma.user.findMany({
    where: { ...buildUserWhere(q), isActive: true },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
    take: MAX_OPCOES,
  });
}
