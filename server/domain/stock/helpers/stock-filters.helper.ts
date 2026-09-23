import type { Prisma } from '@prisma/client';
import type { StockKindSpec } from './stock-kind.helper';

// Busca e vista das três listagens de estoque — funções puras, sem I/O.
//
// A allowlist de ordenação NÃO mora aqui: ela é do `StockKindSpec`, porque é a
// única coisa que difere entre os três (o componente ordena por `serial`). O
// parser em `core/http/list-query.ts` a recebe por parâmetro, porque `core` não
// pode conhecer negócio.

/**
 * O `where` da busca `?q=`, montado a partir do `searchable` da spec.
 *
 * `mode: 'insensitive'` é obrigatório: sem ele, buscar "logitech" não acha
 * "Logitech". Mesma armadilha da listagem de ativos.
 *
 * Varre também o NOME DA CATEGORIA e o do FABRICANTE, que não estão no
 * `searchable` porque não são colunas desta tabela: é assim que se procura
 * estoque na prática — "os mouses da Logitech", não o número do modelo.
 */
export function buildStockWhere(spec: StockKindSpec, q?: string): Prisma.AccessoryWhereInput {
  if (!q) return {};

  const contem = { contains: q, mode: 'insensitive' } as const;

  return {
    OR: [
      ...spec.searchable.map((campo) => ({ [campo]: contem })),
      { category: { name: contem } },
      { manufacturer: { name: contem } },
    ],
  };
}

/**
 * A LIXEIRA, explícita.
 *
 * `active` não escreve nada: quem filtra é a `softDeleteExtension`, que escopa
 * toda consulta sozinha. `trashed` escreve `deletedAt: { not: null }`, que é o
 * escape hatch documentado da extension — a chave presente no `where` vence o
 * escopo automático.
 */
export function buildStockViewWhere(view: 'active' | 'trashed'): Prisma.AccessoryWhereInput {
  return view === 'trashed' ? { deletedAt: { not: null } } : {};
}
