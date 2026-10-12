import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../core/api/apiClient';
import { userKeys } from '../user/user.queries';
import { workstationKeys } from '../workstation/workstation.queries';
import type { ListEnvelope, ListParams } from '../shared/list.types';
import type {
  AjustarEstoqueInput, AlvoDaSaidaInput, CriarItemDeEstoqueInput, EditarItemDeEstoqueInput,
  EventoDeEstoque, ItemDeEstoque, ItemDeEstoqueDetalhe, MovimentoDeEstoque,
  ResultadoDaSaida, ResultadoDoAjuste,
} from '../shared/stock.types';

// O ESTOQUE — monitor, teclado, mouse, cabo: o que tem quantidade e não
// patrimônio (docs/decisoes/estoque.md).
//
// `['stock']` é o prefixo, então invalidar depois de gravar alcança a
// listagem E o detalhe aberto — e também a entrada e a saída precisam invalidar
// USUÁRIOS (invariante 6: unidade no nome de alguém trava o `DELETE` dele) e
// POSTOS (a ficha mostra as unidades da mesa), do mesmo jeito que a licença
// invalida posse ao entregar um assento.

export const stockKeys = {
  all: ['stock'] as const,
  list: (params: ListParams) => ['stock', 'list', params] as const,
  item: (id: string) => ['stock', 'item', id] as const,
  movements: (id: string) => ['stock', 'movements', id] as const,
};

export function useStockQuery(params: ListParams) {
  return useQuery({
    queryKey: stockKeys.list(params),
    queryFn: async () => (await apiClient.get<ListEnvelope<ItemDeEstoque>>('/stock/items', { params })).data,
    // Sem isto a tabela pisca em branco a cada troca de página, de vista ou tecla da busca.
    placeholderData: keepPreviousData,
  });
}

export function useStockItemQuery(id: string | null) {
  return useQuery({
    queryKey: stockKeys.item(id ?? ''),
    queryFn: async () => (await apiClient.get<ItemDeEstoqueDetalhe>(`/stock/items/${id}`)).data,
    enabled: id != null,
  });
}

export function useStockMovementsQuery(id: string | null) {
  return useQuery({
    queryKey: stockKeys.movements(id ?? ''),
    queryFn: async () =>
      (await apiClient.get<{ total: number; rows: EventoDeEstoque[] }>(`/stock/items/${id}/movements`)).data,
    enabled: id != null,
  });
}

function invalidarEstoqueEPosse(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: stockKeys.all });
  void queryClient.invalidateQueries({ queryKey: userKeys.all });
  void queryClient.invalidateQueries({ queryKey: workstationKeys.all });
}

export function useCreateStockItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CriarItemDeEstoqueInput) => apiClient.post<ItemDeEstoque>('/stock/items', data),
    onSuccess: () => invalidarEstoqueEPosse(queryClient),
  });
}

export function useUpdateStockItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: EditarItemDeEstoqueInput }) =>
      apiClient.put<ItemDeEstoque>(`/stock/items/${id}`, data),
    onSuccess: () => invalidarEstoqueEPosse(queryClient),
  });
}

export function useDeleteStockItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/stock/items/${id}`),
    onSuccess: () => invalidarEstoqueEPosse(queryClient),
  });
}

export function useRestoreStockItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.post(`/stock/items/${id}/restore`),
    onSuccess: () => invalidarEstoqueEPosse(queryClient),
  });
}

/** Entrada e baixa — a única porta para o total do item. */
export function useAdjustStock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, data }: { itemId: string; data: AjustarEstoqueInput }) =>
      apiClient.post<ResultadoDoAjuste>(`/stock/items/${itemId}/adjust`, data),
    onSuccess: () => invalidarEstoqueEPosse(queryClient),
  });
}

/** A saída: `qty` unidades para um colaborador ou um posto. */
export function useCheckoutStock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, alvo }: { itemId: string; alvo: AlvoDaSaidaInput }) =>
      apiClient.post<ResultadoDaSaida>(`/stock/items/${itemId}/checkout`, alvo),
    onSuccess: () => invalidarEstoqueEPosse(queryClient),
  });
}

/** A devolução — pelo id do MOVIMENTO (a unidade), não do item. */
export function useCheckinStock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ movementId, notes }: { movementId: string; notes?: string | null }) =>
      apiClient.post<MovimentoDeEstoque>(`/stock/movements/${movementId}/checkin`, { notes }),
    onSuccess: () => invalidarEstoqueEPosse(queryClient),
  });
}
