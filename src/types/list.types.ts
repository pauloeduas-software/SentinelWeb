/**
 * Envelope de toda listagem da API — mesmo formato em /assets, /users e nas
 * seis tabelas de catálogo (server/infra/http/list-query.ts).
 *
 * `total` é a contagem da tabela inteira sob o filtro atual, não o tamanho da
 * página: é ele que alimenta o contador do cabeçalho e o número de páginas.
 */
export interface ListEnvelope<T> {
  total: number;
  rows: T[];
}

/** `trashed` lista a lixeira; só nas rotas que têm soft delete. */
export type ListView = 'active' | 'trashed';

/** Parâmetros que toda listagem aceita. */
export interface ListParams {
  page?: number;
  perPage?: number;
  q?: string;
  view?: ListView;
}

/**
 * Licenças e Estoque: o que toda listagem aceita MAIS o filtro por categoria.
 * Fica fora do `ListParams` porque nem toda listagem tem categoria.
 */
export type ListParamsComCategoria = ListParams & { categoryId?: string };
