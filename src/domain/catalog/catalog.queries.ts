import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../core/api/apiClient';
import type { CatalogOption, CatalogRow } from '../shared/catalog.types';
import type { ListEnvelope, ListParams } from '../shared/list.types';

// Um conjunto de hooks para as CINCO tabelas de catálogo — o espelho, no
// frontend, do CRUD genérico do servidor. O `slug` é o que muda.
//
// A chave inclui o slug e os parâmetros: sem isso a aba de Fabricantes seria
// servida do cache da de Categorias. `['catalog', slug]` continua sendo o
// prefixo, então invalidar depois de gravar alcança a listagem E as opções da
// mesma tabela, sem a mutação saber em que página ou em que `<select>` o dado
// está sendo mostrado.
export const catalogKeys = {
  tabela: (slug: string) => ['catalog', slug] as const,
  list: (slug: string, params: CatalogListParams) => ['catalog', slug, 'list', params] as const,
  // O TERMO DE BUSCA ENTRA NA CHAVE (F10, Etapa B). Sem ele, a primeira
  // resposta ficaria no cache sob a mesma chave de toda busca seguinte: digitar
  // no campo devolveria a lista inteira, do cache, sem nenhuma requisição —
  // e o `staleTime` de um minuto lá embaixo tornaria isso ainda mais difícil de
  // perceber, porque funcionaria na primeira vez e não na segunda.
  options: (rota: string, tipo?: string, q?: string, parametros?: Record<string, string>) =>
    ['catalog', rota, 'options', tipo ?? null, q ?? null, parametros ?? null] as const,
};

type CatalogInput = Record<string, unknown>;

/** A listagem aceita, além do comum, o filtro que a spec declara (`type` nas categorias). */
type CatalogListParams = ListParams & Record<string, unknown>;

export function useCatalogQuery(slug: string, params: CatalogListParams) {
  return useQuery({
    queryKey: catalogKeys.list(slug, params),
    queryFn: async () =>
      (await apiClient.get<ListEnvelope<CatalogRow>>(`/${slug}`, { params })).data,
    // Sem isto a tabela pisca em branco a cada troca de página ou tecla da busca.
    //
    // MAS SÓ DENTRO DA MESMA TABELA. As seis abas dividem este hook, e o
    // `keepPreviousData` puro reaproveitava a resposta de QUALQUER chave
    // anterior: trocar de Categorias para Status mostrava as categorias sob o
    // cabeçalho de Status até a resposta chegar — e elas respondiam a clique,
    // com o Editar abrindo o formulário de status sobre uma linha de categoria.
    // Entre abas não há o que manter: a aba nova começa em "Carregando…".
    placeholderData: (anterior, consultaAnterior) =>
      consultaAnterior?.queryKey[1] === slug ? anterior : undefined,
  });
}

/**
 * Opções para `<select>`. `rota` é o slug do catálogo — colaboradores
 * (`people`) inclusive — ou `assets`: as duas respondem no mesmo formato, então
 * um hook só atende as duas.
 *
 * `q` É BUSCA DO SERVIDOR, e já era aceita por `/options` desde a F1 — as duas
 * rotas (catálogo e ativos) a leem e a aplicam no `where`. O que
 * faltava era a tela mandar: acima do teto de 200 opções, escolher a 201ª era
 * impossível pelo formulário (observação 7 da auditoria da F1).
 *
 * Filtro LOCAL sobre as 200 não resolveria nada — o problema só mudaria de
 * número, porque as 200 que chegam são as 200 primeiras em ordem alfabética.
 */
export function useCatalogOptionsQuery(
  rota: string,
  tipo?: string,
  q?: string,
  /**
   * Outros parâmetros da rota de opções, quando ela tem um recorte próprio —
   * `{ maquina: 'sem' }` em `/assets/options`, para o seletor do vínculo. Entra
   * na chave, senão a lista filtrada seria servida do cache da inteira.
   */
  parametros?: Record<string, string>,
) {
  return useQuery({
    queryKey: catalogKeys.options(rota, tipo, q, parametros),
    queryFn: async () =>
      (await apiClient.get<CatalogOption[]>(`/${rota}/options`, {
        params: { ...(tipo ? { type: tipo } : {}), ...(q ? { q } : {}), ...(parametros ?? {}) },
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

/** Tira da lixeira — só na tabela que a tem (hoje, colaboradores). */
export function useRestoreCatalogRow(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.post(`/${slug}/${id}/restore`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: catalogKeys.tabela(slug) }),
  });
}
