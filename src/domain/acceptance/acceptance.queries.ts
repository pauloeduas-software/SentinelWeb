import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { apiClient } from '../../core/api/apiClient';
import { assetKeys } from '../asset/asset.queries';
import type { Termo, TermoPublico, VistaDeAceite } from '../shared/acceptance.types';

// O TRANSPORTE DO ACEITE. Metade daqui NÃO passa pelo `apiClient`, e a razão é
// o que separa as duas metades do domínio:
//
// As rotas do token são PÚBLICAS mas vivem sob `/api/aceite/` — e não sob
// `/aceite/`, que é o caminho da PÁGINA no React Router. As duas no mesmo lugar
// colidiriam em produção, onde o Fastify resolveria a rota da API antes do
// `/*` que entrega o `index.html`, e o navegador receberia JSON no lugar da
// tela. Em desenvolvimento o defeito nem apareceria: o proxy do Vite só
// encaminha `/api`.
//
// Elas usam um `axios` PRÓPRIO, sem o interceptor do `apiClient`: ele
// redireciona para o login no 401, e mandar para a tela de login justamente
// quem não tem conta — o gestor que assina pelo posto (D27) — seria fechar a
// porta no único caso que a página existe para cobrir.

export const acceptanceKeys = {
  all: ['acceptances'] as const,
  lista: (view: VistaDeAceite) => ['acceptances', 'list', view] as const,
  publico: (token: string) => ['acceptances', 'publico', token] as const,
};

/** Cliente da página pública: nada de sessão, nada de redirecionar para login. */
const publico = axios.create({ withCredentials: false });

/** O prefixo das rotas do token. A PÁGINA é `/aceite/:token`; a API, esta. */
const API_ACEITE = '/api/aceite';

export function useTermoPublicoQuery(token: string | undefined) {
  return useQuery({
    queryKey: acceptanceKeys.publico(token ?? ''),
    queryFn: async () => (await publico.get<TermoPublico>(`${API_ACEITE}/${token}`)).data,
    enabled: Boolean(token),
    // Termo é documento: não recarrega sozinho ao voltar para a aba, e um
    // `retry` no 404/410 só repetiria o erro três vezes antes de mostrá-lo.
    retry: false,
    refetchOnWindowFocus: false,
  });
}

/** A URL do PDF. Aberta em aba nova — o token na URL é a credencial. */
export function urlDoPdfPublico(token: string): string {
  return `${API_ACEITE}/${token}/pdf`;
}

export function useAceitarTermo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ token, assinatura }: { token: string; assinatura?: string }) =>
      (await publico.post(`${API_ACEITE}/${token}/aceitar`, { assinatura })).data,
    onSuccess: (_r, { token }) =>
      queryClient.invalidateQueries({ queryKey: acceptanceKeys.publico(token) }),
  });
}

export function useRecusarTermo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ token, motivo }: { token: string; motivo?: string }) =>
      (await publico.post(`${API_ACEITE}/${token}/recusar`, { motivo })).data,
    onSuccess: (_r, { token }) =>
      queryClient.invalidateQueries({ queryKey: acceptanceKeys.publico(token) }),
  });
}

// ------------------------------------------------------------ o painel
// Daqui para baixo tudo exige sessão e usa o `apiClient` normal.

export function useAcceptancesQuery(view: VistaDeAceite) {
  return useQuery({
    queryKey: acceptanceKeys.lista(view),
    queryFn: async () =>
      (await apiClient.get<{ total: number; rows: Termo[] }>('/acceptances', { params: { view } })).data,
  });
}

export function useLembrarTermo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.post(`/acceptances/${id}/remind`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: acceptanceKeys.all });
      void queryClient.invalidateQueries({ queryKey: assetKeys.all });
    },
  });
}
