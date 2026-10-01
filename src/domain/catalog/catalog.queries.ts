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
  // O TERMO DE BUSCA ENTRA NA CHAVE (F10, Etapa B). Sem ele, a primeira
  // resposta ficaria no cache sob a mesma chave de toda busca seguinte: digitar
  // no campo devolveria a lista inteira, do cache, sem nenhuma requisição —
  // e o `staleTime` de um minuto lá embaixo tornaria isso ainda mais difícil de
  // perceber, porque funcionaria na primeira vez e não na segunda.
  options: (rota: string, tipo?: string, q?: string) =>
    ['catalog', rota, 'options', tipo ?? null, q ?? null] as const,
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
 *
 * `q` É BUSCA DO SERVIDOR, e já era aceita por `/options` desde a F1 — as três
 * rotas (catálogo, ativos e usuários) a leem e a aplicam no `where`. O que
 * faltava era a tela mandar: acima do teto de 200 opções, escolher a 201ª era
 * impossível pelo formulário (observação 7 da auditoria da F1).
 *
 * Filtro LOCAL sobre as 200 não resolveria nada — o problema só mudaria de
 * número, porque as 200 que chegam são as 200 primeiras em ordem alfabética.
 */
export function useCatalogOptionsQuery(rota: string, tipo?: string, q?: string) {
  return useQuery({
    queryKey: catalogKeys.options(rota, tipo, q),
    queryFn: async () =>
      (await apiClient.get<CatalogOption[]>(`/${rota}/options`, {
        params: { ...(tipo ? { type: tipo } : {}), ...(q ? { q } : {}) },
      })).data,
    // Catálogo muda pouco: não vale refazer a consulta a cada abertura de modal.
    staleTime: 60_000,
    // Sem isto, cada tecla da busca esvazia a lista enquanto a próxima resposta
    // não chega — e um `<select>` que fica vazio por 300 ms perde o foco do que
    // a pessoa estava lendo.
    placeholderData: keepPreviousData,
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
