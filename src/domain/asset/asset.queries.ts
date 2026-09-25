import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../core/api/apiClient';
import type {
  Asset, AssetListParams, AssetStats, BulkInput, BulkResult, EventoDoAtivo, RetireInput,
} from '../shared/asset.types';
import type { ListEnvelope } from '../shared/list.types';

// A chave inclui os parâmetros: sem isso a página 2 seria servida do cache da
// página 1. `all` é o prefixo — invalidar ['assets'] alcança listagem e
// contadores, e as mutações não precisam saber em que página o usuário está.
export const assetKeys = {
  all: ['assets'] as const,
  list: (params: AssetListParams) => ['assets', 'list', params] as const,
  // A tela de detalhe e a aba Histórico penduram no mesmo prefixo de propósito:
  // toda mutação invalida `['assets']` e as duas recarregam junto com a
  // listagem, sem cada mutação precisar saber que telas estão abertas.
  detail: (id: string) => ['assets', 'detail', id] as const,
  history: (id: string) => ['assets', 'history', id] as const,
  stats: () => ['assets', 'stats'] as const,
  nextTag: () => ['assets', 'next-tag'] as const,
};

export type AssetInput = Record<string, unknown>;

export function useAssetsQuery(params: AssetListParams) {
  return useQuery({
    queryKey: assetKeys.list(params),
    queryFn: async () => (await apiClient.get<ListEnvelope<Asset>>('/assets', { params })).data,
    placeholderData: keepPreviousData,
  });
}

/**
 * UM ativo por id — a tela de detalhe (`/ativos/:id`).
 *
 * `enabled` porque a rota entrega `id` como `string | undefined` no primeiro
 * render: sem ele, a primeira consulta iria para `/assets/undefined` e voltaria
 * 422.
 */
export function useAssetQuery(id: string | undefined) {
  return useQuery({
    queryKey: assetKeys.detail(id ?? ''),
    queryFn: async () => (await apiClient.get<Asset>(`/assets/${id}`)).data,
    enabled: id != null && id !== '',
  });
}

/** A aba Histórico: `ActivityLog` + posse, do mais recente para o mais antigo. */
export function useAssetHistoryQuery(id: string | undefined) {
  return useQuery({
    queryKey: assetKeys.history(id ?? ''),
    queryFn: async () =>
      (await apiClient.get<ListEnvelope<EventoDoAtivo>>(`/assets/${id}/history`)).data,
    enabled: id != null && id !== '',
  });
}

export function useAssetStatsQuery() {
  return useQuery({
    queryKey: assetKeys.stats(),
    queryFn: async () => (await apiClient.get<AssetStats>('/assets/stats')).data,
  });
}

/**
 * A etiqueta que o formulário mostra ao abrir em modo de criação.
 *
 * É *peek*: o servidor não consome o número. Por isso `staleTime: 0` e
 * `gcTime` curto — depois de um cadastro, o valor em cache já está velho, e
 * mostrar a etiqueta anterior sugeriria duplicata onde não há.
 */
export function useNextAssetTagQuery(habilitado: boolean) {
  return useQuery({
    queryKey: assetKeys.nextTag(),
    queryFn: async () => (await apiClient.get<{ assetTag: string }>('/settings/next-asset-tag')).data,
    enabled: habilitado,
    staleTime: 0,
  });
}

/**
 * Criar — e é também a mutação do CLONE: clonar é abrir o formulário com os
 * valores de outro ativo e gravar um NOVO, sem rota própria no servidor.
 *
 * Devolve o ativo criado (e não a resposta HTTP) porque quem clona precisa do
 * `id` novo para ir até a tela dele.
 */
export function useCreateAsset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: AssetInput) => (await apiClient.post<Asset>('/assets', data)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: assetKeys.all }),
  });
}

export function useUpdateAsset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: AssetInput }) => apiClient.put(`/assets/${id}`, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: assetKeys.all }),
  });
}

export function useDeleteAsset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/assets/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: assetKeys.all }),
  });
}

export function useRestoreAsset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.post(`/assets/${id}/restore`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: assetKeys.all }),
  });
}

/**
 * DESCOMISSIONAR — o ativo saiu do patrimônio.
 *
 * Mutação separada da edição porque não é um campo do formulário: é operação,
 * com regra própria (ativo entregue é recusado) e linha própria no histórico.
 */
export function useRetireAsset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: RetireInput }) =>
      apiClient.post(`/assets/${id}/retire`, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: assetKeys.all }),
  });
}

/** Desfazer o descomissionamento: a venda não saiu, o "roubado" apareceu. */
export function useUnretireAsset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.post(`/assets/${id}/unretire`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: assetKeys.all }),
  });
}

/**
 * AÇÃO EM MASSA — uma operação, N ativos, tudo ou nada (D21).
 *
 * O erro SOBE: 409 com a etiqueta do ativo que barrou é a informação mais útil
 * da operação inteira, e engoli-lo deixaria a tela "não fez nada" sem dizer por
 * quê. Quem chama mostra a mensagem.
 */
export function useBulkAssets() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: BulkInput) =>
      (await apiClient.post<BulkResult>('/assets/bulk', data)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: assetKeys.all }),
  });
}
