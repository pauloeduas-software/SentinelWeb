import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../core/api/apiClient';
import type { User } from '../shared/user.types';
import type { ListEnvelope, ListParams } from '../shared/list.types';

// QUEM OPERA O SISTEMA — hoje, só Administrador (Z). Quem recebe equipamento é
// colaborador (`person.queries.ts`, e o cadastro na página Colaboradores).
export const userKeys = {
  all: ['users'] as const,
  list: (params: ListParams) => ['users', 'list', params] as const,
};

export interface UserInput {
  name: string;
  email: string;
  /** O cargo (D148). Ausente, numa criação, nasce `ADMIN` pelo `@default`. */
  role?: 'ADMIN';
  /**
   * SÓ na edição, e só pelo botão Desativar/Ativar da lista: desativar recusa
   * o login e derruba a sessão da pessoa.
   */
  isActive?: boolean;
  /**
   * A senha. Obrigatória no cadastro; na edição, ausente mantém a atual e
   * presente troca e derruba as sessões abertas da pessoa.
   */
  password?: string;
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
    // `Partial`: o botão Desativar/Ativar manda só `{ isActive }`, e o
    // `updateUserSchema` do servidor aceita cada campo como opcional.
    mutationFn: ({ id, data }: { id: string; data: Partial<UserInput> }) => apiClient.put(`/users/${id}`, data),
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
