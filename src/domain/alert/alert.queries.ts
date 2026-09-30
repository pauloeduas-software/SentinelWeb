import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../core/api/apiClient';
import type {
  CentralDeAlertas, ConfiguracaoDoCicloDeVida, ResultadoDaRodadaDeAlertas,
} from '../shared/lifecycle.types';

// A CENTRAL DE ALERTAS (docs/FASE-8-PLANO-ITAM.md, Etapa E).

export const alertKeys = {
  all: ['alerts'] as const,
  central: (apenasNaoLidos: boolean) => ['alerts', 'central', apenasNaoLidos] as const,
  configuracao: () => ['alerts', 'configuracao'] as const,
};

/**
 * O sino.
 *
 * `refetchInterval` de cinco minutos e não de cinco segundos: o job roda UMA vez
 * por dia (D56), então nada aqui muda em tempo real — e um sino que consulta a
 * cada segundo é uma requisição por segundo por aba aberta para mostrar o mesmo
 * número. Cinco minutos é o que faz o alerta aparecer sem recarregar a página.
 */
export function useAlertsQuery(apenasNaoLidos = false) {
  return useQuery({
    queryKey: alertKeys.central(apenasNaoLidos),
    queryFn: async () =>
      (await apiClient.get<CentralDeAlertas>('/alerts', {
        params: apenasNaoLidos ? { apenasNaoLidos: 'true' } : undefined,
      })).data,
    refetchInterval: 5 * 60 * 1000,
  });
}

export function useLifecycleSettingsQuery() {
  return useQuery({
    queryKey: alertKeys.configuracao(),
    queryFn: async () =>
      (await apiClient.get<ConfiguracaoDoCicloDeVida>('/settings/alerts')).data,
  });
}

export function useSaveLifecycleSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (dados: Partial<ConfiguracaoDoCicloDeVida>) =>
      (await apiClient.put<ConfiguracaoDoCicloDeVida>('/settings/alerts', dados)).data,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: alertKeys.all });
      // Os limiares são os MESMOS que o relatório usa: mudar a antecedência de
      // garantia muda o que a aba de prazos mostra.
      void queryClient.invalidateQueries({ queryKey: ['reports'] });
    },
  });
}

export function useMarkAlertRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.post(`/alerts/${id}/read`),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: alertKeys.all }),
  });
}

export function useMarkAllAlertsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.post('/alerts/read-all'),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: alertKeys.all }),
  });
}

/**
 * O gatilho manual da rodada — e ele existe para o ajuste de limiar não custar 24 h.
 *
 * A idempotência vem do `dedupeKey` no servidor, não daqui: clicar dez vezes cria
 * os mesmos alertas uma vez. O que ele PODE fazer dez vezes é mandar e-mail, e é
 * por isso que a rota tem o teto de 10/min.
 */
export function useRunAlerts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      (await apiClient.post<ResultadoDaRodadaDeAlertas>('/alerts/run')).data,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: alertKeys.all }),
  });
}
