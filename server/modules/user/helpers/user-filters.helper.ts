import type { Prisma } from '@prisma/client';
import { contemTexto } from '../../shared/busca.helper';

/** A busca e o recorte dos cartões Ativos e Desativados (BT). */
export function buildUserWhere(q?: string, isActive?: boolean): Prisma.UserWhereInput {
  return {
    // `AND`, e não espalhamento: a busca escreve `OR`, e espalhada ela apagaria
    // outro `OR` em silêncio.
    AND: [
      q ? { OR: [{ name: contemTexto(q) }, { email: contemTexto(q) }] } : {},
      isActive === undefined ? {} : { isActive },
    ],
  };
}
