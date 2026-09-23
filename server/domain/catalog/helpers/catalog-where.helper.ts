// Busca das listagens de catálogo — função pura, sem I/O.
//
// `mode: 'insensitive'` é obrigatório: sem ele o Postgres compara com diferença
// de maiúscula e buscar "dell" não acha "Dell".
export function buildCatalogWhere(searchable: readonly string[], q?: string): Record<string, unknown> {
  if (!q) return {};

  return {
    OR: searchable.map((campo) => ({ [campo]: { contains: q, mode: 'insensitive' } })),
  };
}
