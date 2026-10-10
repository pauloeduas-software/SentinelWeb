import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../core/api/apiClient';
import { assetKeys } from '../asset/asset.queries';
import { endpointKeys } from '../endpoint/endpoint.queries';
import type { ListEnvelope } from '../shared/list.types';
import type {
  AtivoOcioso, Cobertura, ConfiguracaoDaDescoberta, MaquinaDoAtivo,
  ReviewState, Sugestao, SuggestionKind,
} from '../shared/reconciliation.types';

// A CONVERGÊNCIA RMM × ITAM (docs/historico/fase-07-convergencia-rmm-itam.md).
//
// `['reconciliation']` é o prefixo, então invalidar depois de resolver uma
// sugestão alcança a fila E o painel de cobertura — que muda a cada aceite sem
// ninguém ter tocado nele.
//
// E o invalidate vai ALÉM do prefixo, de propósito: aceitar uma sugestão muda o
// vínculo máquina↔ativo. Quem não invalidasse `assets` e `endpoints` junto
// deixaria a aba Máquina do ativo vazia até alguém recarregar a página.

export const reconciliationKeys = {
  all: ['reconciliation'] as const,
  sugestoes: (kind?: SuggestionKind) => ['reconciliation', 'sugestoes', kind ?? 'todas'] as const,
  cobertura: () => ['reconciliation', 'cobertura'] as const,
  ociosos: (dias: number) => ['reconciliation', 'ociosos', dias] as const,
  configuracao: () => ['reconciliation', 'configuracao'] as const,
  maquinaDoAtivo: (assetId: string) => ['reconciliation', 'maquina', assetId] as const,
};

export function useSugestoesQuery(kind?: SuggestionKind) {
  return useQuery({
    queryKey: reconciliationKeys.sugestoes(kind),
    queryFn: async () => (
      await apiClient.get<ListEnvelope<Sugestao>>('/reconciliation/suggestions', {
        params: kind ? { kind } : undefined,
      })
    ).data,
  });
}

export function useCoberturaQuery() {
  return useQuery({
    queryKey: reconciliationKeys.cobertura(),
    queryFn: async () => (await apiClient.get<Cobertura>('/reconciliation/coverage')).data,
  });
}

export function useOciososQuery(dias = 30) {
  return useQuery({
    queryKey: reconciliationKeys.ociosos(dias),
    queryFn: async () => (
      await apiClient.get<{ total: number; rows: AtivoOcioso[] }>('/reconciliation/idle', { params: { dias } })
    ).data,
  });
}

export function useConfiguracaoDaDescobertaQuery() {
  return useQuery({
    queryKey: reconciliationKeys.configuracao(),
    queryFn: async () => (await apiClient.get<ConfiguracaoDaDescoberta>('/settings/discovery')).data,
  });
}

/** Tudo o que a aba Máquina mostra: specs, último contato e mudanças de peça. */
export function useMaquinaDoAtivoQuery(assetId: string | null) {
  return useQuery({
    queryKey: reconciliationKeys.maquinaDoAtivo(assetId ?? ''),
    queryFn: async () => (await apiClient.get<MaquinaDoAtivo>(`/assets/${assetId}/machine`)).data,
    enabled: assetId != null,
  });
}

/** Tudo que a resolução de uma sugestão pode ter mudado. */
function useInvalidarTudo() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: reconciliationKeys.all });
    void queryClient.invalidateQueries({ queryKey: assetKeys.all });
    void queryClient.invalidateQueries({ queryKey: endpointKeys.all });
  };
}

export function useAceitarSugestao() {
  const invalidar = useInvalidarTudo();
  return useMutation({
    mutationFn: async (id: string) =>
      (await apiClient.post<Sugestao>(`/reconciliation/suggestions/${id}/accept`, {})).data,
    onSuccess: invalidar,
  });
}

export function useRecusarSugestao() {
  const invalidar = useInvalidarTudo();
  return useMutation({
    mutationFn: async (id: string) =>
      (await apiClient.post<Sugestao>(`/reconciliation/suggestions/${id}/reject`)).data,
    onSuccess: invalidar,
  });
}

export function useTriarMaquina() {
  const invalidar = useInvalidarTudo();
  return useMutation({
    mutationFn: async ({ id, reviewState }: { id: string; reviewState: ReviewState }) =>
      (await apiClient.patch(`/endpoints/${id}/review`, { reviewState })).data,
    onSuccess: invalidar,
  });
}

export function useDesvincularMaquina() {
  const invalidar = useInvalidarTudo();
  return useMutation({
    mutationFn: async (endpointId: string) => (await apiClient.delete(`/endpoints/${endpointId}/link`)).data,
    onSuccess: invalidar,
  });
}

export function useSalvarConfiguracaoDaDescoberta() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (dados: Partial<ConfiguracaoDaDescoberta>) =>
      (await apiClient.put<ConfiguracaoDaDescoberta>('/settings/discovery', dados)).data,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: reconciliationKeys.all });
    },
  });
}
