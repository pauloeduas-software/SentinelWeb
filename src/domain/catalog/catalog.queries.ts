import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../core/api/apiClient';
import type { CatalogOption, CatalogRow } from '../shared/catalog.types';
import type { ListEnvelope, ListParams } from '../shared/list.types';

// Um conjunto de hooks para as SETE tabelas de catálogo — o espelho, no
// frontend, do CRUD genérico do servidor. O `slug` é o que muda.
//
// A chave inclui o slug e os parâmetros: sem isso a aba de Fornecedores seria
// servida do cache da de Categorias. `['catalog', slug]` continua sendo o
// prefixo, então invalidar depois de gravar alcança a listagem E as opções da
// mesma tabela, sem a mutação saber em que página ou em que `<select>` o dado
// está sendo mostrado.
export const catalogKeys = {
  tabela: (slug: string) => ['catalog', slug] as const,
  list: (slug: string, params: ListParams) => ['catalog', slug, 'list', params] as const,
  options: (rota: string, tipo?: string) => ['catalog', rota, 'options', tipo ?? null] as const,
};

export type CatalogInput = Record<string, unknown>;

export function useCatalogQuery(slug: string, params: ListParams) {
  return useQuery({
    queryKey: catalogKeys.list(slug, params),
    queryFn: async () =>
      (await apiClient.get<ListEnvelope<CatalogRow>>(`/${slug}`, { params })).data,
    // Sem isto a tabela pisca em branco a cada troca de página ou tecla da busca.
    placeholderData: keepPreviousData,
  });
}

/**
 * Opções para `<select>`. `rota` é o slug do catálogo ou `users` — as duas
 * respondem no mesmo formato, então um hook só atende as duas.
 */
export function useCatalogOptionsQuery(rota: string, tipo?: string) {
  return useQuery({
    queryKey: catalogKeys.options(rota, tipo),
    queryFn: async () =>
      (await apiClient.get<CatalogOption[]>(`/${rota}/options`, {
        params: tipo ? { type: tipo } : undefined,
      })).data,
    // Catálogo muda pouco: não vale refazer a consulta a cada abertura de modal.
    staleTime: 60_000,
  });
}

export function useCreateCatalogRow(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CatalogInput) => apiClient.post(`/${slug}`, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: catalogKeys.tabela(slug) }),
  });
}

export function useUpdateCatalogRow(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: CatalogInput }) =>
      apiClient.put(`/${slug}/${id}`, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: catalogKeys.tabela(slug) }),
  });
}

export function useDeleteCatalogRow(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/${slug}/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: catalogKeys.tabela(slug) }),
  });
}
