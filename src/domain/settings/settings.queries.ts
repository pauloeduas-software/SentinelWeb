import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../core/api/apiClient';
import type { ConfiguracaoDoSistema } from '../shared/settings.types';

// A CONFIGURAÇÃO DE SISTEMA — formato de número, data e moeda (F10).
//
// POR QUE ESTE RECORTE TEM DOMÍNIO PRÓPRIO, e os outros dois não: a descoberta
// vive em `reconciliation.queries.ts` e os alertas em `alert.queries.ts`, cada
// um ao lado de quem os consome. Este é consumido por TODA tela que formata
// dinheiro ou data — não há um domínio para pendurá-lo sem mentir sobre quem o
// usa.
//
// `staleTime` LONGO e `refetchOnWindowFocus` desligado: é configuração que muda
// quando alguém abre a aba *Sistema* e salva. Sem isso, cada troca de tela
// refaria a consulta que decide o formato de todo número da página.

export const settingsKeys = {
  all: ['settings'] as const,
  sistema: () => ['settings', 'sistema'] as const,
};

export function useSystemSettingsQuery() {
  return useQuery({
    queryKey: settingsKeys.sistema(),
    queryFn: async () => (await apiClient.get<ConfiguracaoDoSistema>('/settings')).data,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

export function useSaveSystemSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (dados: Partial<ConfiguracaoDoSistema>) =>
      (await apiClient.put<ConfiguracaoDoSistema>('/settings', dados)).data,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: settingsKeys.all }),
  });
}
