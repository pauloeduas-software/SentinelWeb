import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../core/api/apiClient';
import type { ConfiguracaoDoSistema, MarcaVisual } from '../shared/settings.types';

// A CONFIGURAÇÃO DE SISTEMA — marca, formato e retenção do backup (F10).
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

/** A URL da marca. Rota com sessão, nunca o caminho no disco (D84). */
export function urlDaMarca(marca: MarcaVisual): string {
  return `${apiClient.defaults.baseURL ?? ''}/settings/branding/${marca}`;
}

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

/**
 * Sobe logo ou favicon.
 *
 * `FormData` e o `Content-Type` NÃO definido à mão: o navegador precisa
 * escrevê-lo junto com o `boundary` que ele mesmo sorteia, e um
 * `'multipart/form-data'` fixo deixaria a requisição sem boundary — o servidor
 * responderia 415 (é a mesma nota do `attachment.queries.ts`).
 */
export function useSetBranding() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ marca, file }: { marca: MarcaVisual; file: File }) => {
      const corpo = new FormData();
      corpo.append('file', file);
      return (await apiClient.put<ConfiguracaoDoSistema>(`/settings/branding/${marca}`, corpo)).data;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: settingsKeys.all }),
  });
}

export function useClearBranding() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (marca: MarcaVisual) =>
      (await apiClient.delete<ConfiguracaoDoSistema>(`/settings/branding/${marca}`)).data,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: settingsKeys.all }),
  });
}
