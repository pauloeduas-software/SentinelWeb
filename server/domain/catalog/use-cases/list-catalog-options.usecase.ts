import { prisma } from '../../../core/database/prismaClient';
import { buildCatalogWhere } from '../helpers/catalog-where.helper';
import type { CatalogSpec } from '../specs/catalog-spec.types';

// Teto da lista de opções. Alto o bastante para caber o catálogo de uma empresa
// inteira num `<select>`, baixo o bastante para a resposta não virar despejo de
// tabela. Acima disso, o campo de busca (`?q=`) é o caminho.
const MAX_OPCOES = 200;

export interface CatalogOption {
  id: string;
  name: string;
}

/**
 * Lista enxuta para `<select>` — id e nome, sem envelope e sem paginação.
 *
 * Existe separada da listagem porque `perPage` tem teto de 100
 * (core/http/list-query.ts): certo para tabela, errado para seletor. Um
 * formulário que pedisse `perPage=100` passaria a mentir em silêncio a partir
 * do 101º item.
 */
export async function listCatalogOptions(
  spec: CatalogSpec,
  q?: string,
  filtro?: string,
): Promise<CatalogOption[]> {
  const rows = await spec.delegate(prisma).findMany({
    where: {
      ...buildCatalogWhere(spec.searchable, q),
      ...(filtro && spec.optionFilter ? { [spec.optionFilter.campo]: filtro } : {}),
    },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
    take: MAX_OPCOES,
  });

  return rows as unknown as CatalogOption[];
}
