import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../core/api/apiClient';
import { userKeys } from '../user/user.queries';
import type {
  AcessoDoUsuario, DiretorioLigado, Grupo, GrupoInput, OrigemDaIdentidade,
  PermissaoDoCatalogo, ResultadoDaSincronizacao,
} from '../shared/access.types';
import type { ListEnvelope, ListParams } from '../shared/list.types';

export const accessKeys = {
  all: ['access'] as const,
  catalogo: ['access', 'permissions'] as const,
  grupos: (params: ListParams) => ['access', 'groups', params] as const,
  opcoes: ['access', 'groups', 'options'] as const,
  doUsuario: (id: string) => ['access', 'user', id] as const,
  diretorio: ['access', 'directory'] as const,
};

/**
 * O catálogo de chaves.
 *
 * `staleTime: Infinity` porque ele é CÓDIGO: só muda com um deploy, e nenhum
 * clique no painel o altera. Refetch aqui seria uma requisição por foco de
 * janela para receber sempre a mesma resposta.
 */
export function usePermissoesDoCatalogo() {
  return useQuery({
    queryKey: accessKeys.catalogo,
    queryFn: async () => (await apiClient.get<{ data: PermissaoDoCatalogo[] }>('/permissions')).data.data,
    staleTime: Infinity,
  });
}

export function useGruposQuery(params: ListParams) {
  return useQuery({
    queryKey: accessKeys.grupos(params),
    queryFn: async () => (await apiClient.get<ListEnvelope<Grupo>>('/groups', { params })).data,
    placeholderData: keepPreviousData,
  });
}

export function useOpcoesDeGrupo() {
  return useQuery({
    queryKey: accessKeys.opcoes,
    queryFn: async () => (await apiClient.get<{ data: { id: string; name: string }[] }>('/groups/options')).data.data,
  });
}

export function useAcessoDoUsuario(id: string | null) {
  return useQuery({
    queryKey: accessKeys.doUsuario(id ?? ''),
    queryFn: async () => (await apiClient.get<AcessoDoUsuario>(`/users/${id}/permissions`)).data,
    enabled: id !== null,
  });
}

export function useCriarGrupo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: GrupoInput) => apiClient.post('/groups', data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: accessKeys.all }),
  });
}

export function useEditarGrupo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: GrupoInput }) => apiClient.put(`/groups/${id}`, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: accessKeys.all }),
  });
}

export function useApagarGrupo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/groups/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: accessKeys.all }),
  });
}

/**
 * Troca os grupos de uma pessoa.
 *
 * INVALIDA `userKeys.all` TAMBÉM, e não só o acesso: a troca de grupo entra no
 * `ActivityLog` da PESSOA (é na linha do tempo dela que "o acesso mudou"
 * aparece, ao lado do desligamento), então a aba Histórico do perfil fica velha
 * sem isto.
 */
export function useDefinirGruposDoUsuario() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, groupIds }: { id: string; groupIds: string[] }) =>
      apiClient.put(`/users/${id}/groups`, { groupIds }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: accessKeys.all });
      void queryClient.invalidateQueries({ queryKey: userKeys.all });
    },
  });
}

// ── O DIRETÓRIO E O SSO (F11, Etapa I) ──────────────────────────────────────

/**
 * O diretório e o SSO estão ligados?
 *
 * `staleTime: Infinity` pelo mesmo motivo do catálogo de chaves: a resposta vem
 * de variável de ambiente, então só muda com um deploy. E a consulta roda também
 * na tela de LOGIN, onde não há sessão — a rota é pública de propósito.
 */
export function useDiretorioLigado() {
  return useQuery({
    queryKey: accessKeys.diretorio,
    queryFn: async () => (await apiClient.get<DiretorioLigado>('/access/directory')).data,
    staleTime: Infinity,
  });
}

/**
 * Roda a sincronização com o diretório AGORA.
 *
 * INVALIDA os usuários também: a sincronização cria e atualiza pessoas, e a
 * listagem de `/users` fica velha sem isto — que é a tela de onde alguém clicou
 * para conferir o resultado.
 */
export function useSincronizarDiretorio() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      (await apiClient.post<ResultadoDaSincronizacao>('/access/directory/sync')).data,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: userKeys.all });
    },
  });
}

/**
 * Muda a origem da identidade de uma pessoa — o vínculo explícito do D78.
 *
 * Invalida o USUÁRIO e não o acesso: o campo mora na ficha dele
 * (`USER_DETAIL_SELECT`), e é lá que a mudança precisa aparecer.
 */
export function useDefinirOrigemDaIdentidade() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, authSource }: { id: string; authSource: OrigemDaIdentidade }) =>
      apiClient.put(`/users/${id}/auth-source`, { authSource }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: userKeys.all });
      void queryClient.invalidateQueries({ queryKey: accessKeys.all });
    },
  });
}
