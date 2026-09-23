import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../core/api/apiClient';
import type { TokenDeAgente, TokenEmitido } from '../shared/auth.types';

// Os tokens do agente. Transporte e mais nada — a decisão de mostrar o segredo
// uma vez só é da tela, porque é ela que sabe quando o operador o copiou.

export const agentTokenKeys = {
  all: ['agent-tokens'] as const,
};

export function useAgentTokensQuery() {
  return useQuery({
    queryKey: agentTokenKeys.all,
    queryFn: async () => (await apiClient.get<TokenDeAgente[]>('/agent-tokens')).data,
  });
}

export function useEmitirToken() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) =>
      (await apiClient.post<TokenEmitido>('/agent-tokens', { name })).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: agentTokenKeys.all }),
  });
}

export function useRevogarToken() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.post(`/agent-tokens/${id}/revoke`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: agentTokenKeys.all }),
  });
}
