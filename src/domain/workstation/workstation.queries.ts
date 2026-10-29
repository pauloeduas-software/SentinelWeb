import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../core/api/apiClient';
import { catalogKeys } from '../catalog/catalog.queries';
import type { ListEnvelope } from '../shared/list.types';
import type { Posto, PostoDetalhe, PostoView } from '../shared/workstation.types';

// O POSTO DE TRABALHO — a Mesa 1, a bancada, o guichê.
//
// A chave inclui os parâmetros e o recorte: sem isso a visão "Vagos" seria
// servida do cache de "Todos". `['workstations']` continua sendo o prefixo,
// então invalidar alcança a lista E o detalhe aberto — o que importa porque
// colocar alguém num posto muda a linha dele na lista sem a lista ter sido
// tocada.
export const workstationKeys = {
  all: ['workstations'] as const,
  list: (params: PostoListParams) => ['workstations', 'list', params] as const,
  detalhe: (id: string) => ['workstations', 'detalhe', id] as const,
};

interface PostoListParams {
  page?: number;
  perPage?: number;
  q?: string;
  view?: PostoView;
}

export function useWorkstationsQuery(params: PostoListParams) {
  return useQuery({
    queryKey: workstationKeys.list(params),
    queryFn: async () =>
      (await apiClient.get<ListEnvelope<Posto>>('/workstations', { params })).data,
    // Sem isto a tabela pisca em branco a cada troca de página, de recorte ou
    // tecla da busca.
    placeholderData: keepPreviousData,
  });
}

export function useWorkstationQuery(id: string | null) {
  return useQuery({
    queryKey: workstationKeys.detalhe(id ?? ''),
    queryFn: async () => (await apiClient.get<PostoDetalhe>(`/workstations/${id}`)).data,
    enabled: id != null,
  });
}

/** Corpo do cadastro de um posto. Na edição, só o que mudou. */
export interface PostoInput {
  name?: string;
  /** A localização onde o posto fica — obrigatória ao criar. */
  locationId?: string;
  notes?: string | null;
  /** A versão que o formulário leu ao abrir (AF) — só no Editar; o servidor recusa se a linha mudou. */
  updatedAt?: string;
}

/**
 * O CADASTRO do posto — `POST`, `PUT` e `DELETE /workstations`, o mesmo CRUD
 * das tabelas de catálogo no servidor (`workstationSpec`): nome único, 409 pelo
 * que está nele agora, `AuditLog`.
 *
 * Invalidam DOIS caches: a lista de postos e as OPÇÕES de posto
 * (`catalogKeys.tabela('workstations')`), que os seletores da entrega de ativo, da
 * de estoque e do vínculo de máquina leem. Sem a segunda, o posto criado não
 * aparecia no seletor — e o excluído continuava sendo oferecido — até o
 * `staleTime` vencer.
 */
function useMutacaoDePosto<T>(mutationFn: (dados: T) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    // No erro também: o 409 quase sempre quer dizer que a tela está velha, e o
    // Editar reaberto precisa da versão nova (AF).
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: workstationKeys.all });
      void queryClient.invalidateQueries({ queryKey: catalogKeys.tabela('workstations') });
    },
  });
}

export function useCreateWorkstation() {
  return useMutacaoDePosto((data: PostoInput) => apiClient.post('/workstations', data));
}

export function useUpdateWorkstation() {
  return useMutacaoDePosto(({ id, data }: { id: string; data: PostoInput }) =>
    apiClient.put(`/workstations/${id}`, data));
}

export function useDeleteWorkstation() {
  return useMutacaoDePosto((id: string) => apiClient.delete(`/workstations/${id}`));
}
