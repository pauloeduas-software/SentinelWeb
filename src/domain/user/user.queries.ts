import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../core/api/apiClient';
import { assetKeys } from '../asset/asset.queries';
import { assignmentKeys } from '../assignment/assignment.queries';
import { occupancyKeys } from '../occupancy/occupancy.queries';
import { stockKeys } from '../stock/stock.queries';
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
  department?: string;
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

/** Corpo de `POST /api/users/:id/offboard`. */
export interface OffboardInput {
  /** Vai para a devolução de cada ativo e para a trilha de auditoria. */
  notes?: string;
  /** Para onde os ativos voltam. Em branco, o servidor manda ao estoque. */
  statusId?: string;
}

/** Um ativo que o desligamento devolveu. */
export interface AtivoDevolvido {
  assignmentId: string;
  assetId: string;
  assetTag: string;
}

/** Uma unidade de acessório que voltou ao estoque no desligamento. */
export interface AcessorioDevolvido {
  checkoutId: string;
  accessoryId: string;
  accessoryName: string;
}

/** Um posto que o desligamento desocupou. */
export interface OcupacaoEncerrada {
  id: string;
  locationId: string;
  locationName: string;
  shift: string | null;
}

/**
 * O relatório do desligamento: o que a operação FECHOU, item a item.
 *
 * A tela mostra isto depois de confirmar, e é o mesmo par de listas que ela
 * mostrou ANTES, no aviso do modal — a confirmação do que foi prometido.
 */
export interface ResultadoDesligamento {
  user: { id: string; name: string; email: string; isActive: boolean; terminatedAt: string | null };
  devolvidos: AtivoDevolvido[];
  /**
   * As unidades de acessório de alvo `USER` que voltaram ao estoque (F5).
   *
   * As do POSTO não entram, e a ausência delas aqui é o ponto: os 5 mouses da
   * Mesa 1 continuam na mesa, com quem ficou. Devolvê-los faria o inventário
   * mentir com o saldo batendo.
   */
  acessoriosDevolvidos: AcessorioDevolvido[];
  ocupacoesEncerradas: OcupacaoEncerrada[];
}

/**
 * DESLIGAR — devolve os ativos diretos, encerra as ocupações de posto e marca a
 * saída, numa transação só no servidor (D32).
 *
 * Invalida QUATRO caches, e nenhum deles é decorativo:
 *
 * - `users`       o perfil passou a mostrar "desligado em";
 * - `assignments` as posses diretas fecharam, e o `holdings` esvaziou;
 * - `occupancies` os postos da pessoa foram desocupados;
 * - `assets`      a coluna Responsável da listagem mudou em DOIS lugares — nos
 *   ativos devolvidos e, sem ninguém ter tocado neles, em todo ativo dos postos
 *   que ela deixou: a responsabilidade é derivada (Camada 3), e sair da Mesa 1
 *   muda quem responde por tudo que está lá;
 * - `stock`       as unidades de acessório no nome dela voltaram ao estoque, e
 *   o disponível de cada item mudou (F5).
 */
export function useOffboardUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: OffboardInput }) =>
      (await apiClient.post<ResultadoDesligamento>(`/users/${id}/offboard`, data)).data,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: userKeys.all });
      void queryClient.invalidateQueries({ queryKey: assignmentKeys.all });
      void queryClient.invalidateQueries({ queryKey: occupancyKeys.all });
      void queryClient.invalidateQueries({ queryKey: assetKeys.all });
      void queryClient.invalidateQueries({ queryKey: stockKeys.all });
    },
  });
}
