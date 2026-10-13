import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../core/api/apiClient';
import type { EventoDaPessoa, User, UserDetail } from '../shared/user.types';
import type { ListEnvelope, ListParams } from '../shared/list.types';

export const userKeys = {
  all: ['users'] as const,
  list: (params: ListParams) => ['users', 'list', params] as const,
  um: (id: string) => ['users', 'detail', id] as const,
  // Pendurada no mesmo prefixo do perfil, como no ativo: toda mutação invalida
  // `['users']` e as duas recarregam juntas, sem a mutação precisar saber que
  // telas estão abertas.
  history: (id: string) => ['users', 'history', id] as const,
};

export interface UserInput {
  name: string;
  email: string;
  /** O papel (D148). Ausente, numa criação, nasce `USUARIO` pelo `@default`. */
  role?: 'USUARIO' | 'TECNICO' | 'ADMIN';
  /** SÓ na edição: desativar impede entrega nova e derruba a sessão da pessoa. */
  isActive?: boolean;
  employeeNumber?: string | null;
  jobTitle?: string | null;
  phone?: string | null;
  address?: string | null;
  /** `AAAA-MM-DD`. */
  hiredAt?: string | null;
}

export function useUsersQuery(params: ListParams) {
  return useQuery({
    queryKey: userKeys.list(params),
    queryFn: async () => (await apiClient.get<ListEnvelope<User>>('/users', { params })).data,
    placeholderData: keepPreviousData,
  });
}

export function useCreateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: UserInput) => apiClient.post('/users', data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: userKeys.all }),
  });
}

export function useUpdateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UserInput }) => apiClient.put(`/users/${id}`, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: userKeys.all }),
  });
}

export function useRestoreUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.post(`/users/${id}/restore`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: userKeys.all }),
  });
}

export function useDeleteUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/users/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: userKeys.all }),
  });
}

/**
 * UM colaborador — a tela de perfil.
 *
 * Chave própria (`users/detail/:id`) e não um `find` na lista em cache: quem
 * abre `/users/:id` direto, ou recarrega a página, não tem lista nenhuma
 * carregada. O `enabled` segura a consulta enquanto o id não existe.
 */
export function useUserQuery(id: string | null) {
  return useQuery({
    queryKey: userKeys.um(id ?? ''),
    queryFn: async () => (await apiClient.get<UserDetail>(`/users/${id}`)).data,
    enabled: id != null,
  });
}

/**
 * A aba Histórico da pessoa: `ActivityLog` + posses diretas + ocupações de
 * posto, do mais recente para o mais antigo.
 */
export function useUserHistoryQuery(id: string | null) {
  return useQuery({
    queryKey: userKeys.history(id ?? ''),
    queryFn: async () =>
      (await apiClient.get<ListEnvelope<EventoDaPessoa>>(`/users/${id}/history`)).data,
    enabled: id != null,
  });
}
