import { contemTexto } from '../../shared/busca.helper';

// Busca das listagens de catálogo — função pura, sem I/O (`contemTexto`: sem
// diferença de maiúscula, curingas escapados).
export function buildCatalogWhere(searchable: readonly string[], q?: string): Record<string, unknown> {
  if (!q) return {};

  return {
    OR: searchable.map((campo) => ({ [campo]: contemTexto(q) })),
  };
}
