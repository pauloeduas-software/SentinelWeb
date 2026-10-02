import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../core/api/apiClient';
import type {
  CadastroDeSegundoFator, CodigosDeRecuperacao, StatusDoSegundoFator, TokenEmitido, TokenPessoal,
} from '../shared/auth.types';

// A SEGURANÇA DA PRÓPRIA CONTA (F11, Etapa H): segundo fator e tokens pessoais.
//
// POR QUE AQUI TEM TanStack Query E O `auth.queries.ts` NÃO: a sessão é client
// state (não envelhece, ninguém faz polling dela) e mora no zustand. Isto é
// server state de verdade — a lista de tokens muda quando se emite ou revoga, e
// o status do segundo fator muda quando se confirma. É dado do servidor que uma
// tela lê e invalida, que é exatamente o balde do Query (docs/ARQUITETURA.md).
//
// E ELES NÃO ENTRAM NO `auth.store`: pôr a lista de tokens no store criaria duas
// fontes de verdade para o que o servidor já sabe, que é a única regra absoluta
// daquela divisão.

export const segurancaKeys = {
  segundoFator: ['auth', 'totp'] as const,
  meusTokens: ['me', 'tokens'] as const,
};

// ── O SEGUNDO FATOR ─────────────────────────────────────────────────────────

export function useSegundoFatorQuery() {
  return useQuery({
    queryKey: segurancaKeys.segundoFator,
    queryFn: async () => (await apiClient.get<StatusDoSegundoFator>('/auth/totp')).data,
  });
}

/**
 * Começa o cadastro: gera o segredo no servidor e devolve o QR.
 *
 * `useMutation` e não `useQuery`, apesar de "parecer" leitura: ela ESCREVE —
 * grava o segredo novo na linha da pessoa e invalida o cadastro anterior. Num
 * `useQuery` o react-query a chamaria por conta própria (remontagem, foco na
 * janela), e cada chamada trocaria o segredo por baixo de um QR que já estava na
 * tela.
 */
export function useIniciarSegundoFator() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      (await apiClient.post<CadastroDeSegundoFator>('/auth/totp/enroll')).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: segurancaKeys.segundoFator }),
  });
}

export function useConfirmarSegundoFator() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (totp: string) =>
      (await apiClient.post<CodigosDeRecuperacao>('/auth/totp/confirm', { totp })).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: segurancaKeys.segundoFator }),
  });
}

export function useDesativarSegundoFator() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (codigo: string) => apiClient.post('/auth/totp/disable', { codigo }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: segurancaKeys.segundoFator }),
  });
}

// ── OS TOKENS PESSOAIS ──────────────────────────────────────────────────────

export function useMeusTokensQuery() {
  return useQuery({
    queryKey: segurancaKeys.meusTokens,
    queryFn: async () => (await apiClient.get<TokenPessoal[]>('/me/tokens')).data,
  });
}

export function useEmitirMeuToken() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) =>
      (await apiClient.post<TokenEmitido>('/me/tokens', { name })).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: segurancaKeys.meusTokens }),
  });
}

export function useRevogarMeuToken() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.post(`/me/tokens/${id}/revoke`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: segurancaKeys.meusTokens }),
  });
}
