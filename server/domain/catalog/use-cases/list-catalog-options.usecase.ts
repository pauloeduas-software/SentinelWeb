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
  /** A coluna `optionDetail` da spec, quando ela declara uma. */
  detalhe?: string | null;
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
  /** Os valores aceitos no campo do `optionFilter` — um ou vários. */
  filtro?: readonly string[],
): Promise<CatalogOption[]> {
  const rows = await spec.delegate(prisma).findMany({
    where: {
      ...buildCatalogWhere(spec.searchable, q),
      ...spec.optionsWhere,
      ...(filtro && spec.optionFilter ? { [spec.optionFilter.campo]: { in: filtro } } : {}),
    },
    select: { id: true, name: true, ...(spec.optionDetail ? { [spec.optionDetail]: true } : {}) },
    orderBy: { name: 'asc' },
    take: MAX_OPCOES,
  }) as unknown as Record<string, unknown>[];

  return rows.map((linha) => ({
    id: linha.id as string,
    name: linha.name as string,
    ...(spec.optionDetail ? { detalhe: (linha[spec.optionDetail] as string | null) ?? null } : {}),
  }));
}
