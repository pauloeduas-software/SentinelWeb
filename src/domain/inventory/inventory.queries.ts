import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../core/api/apiClient';
import type { InventoryItem } from '../shared/inventory.types';
import type { ListEnvelope, ListParams } from '../shared/list.types';

// A chave precisa incluir os parâmetros: sem isso a página 2 seria servida do
// cache da página 1. `all` continua sendo o prefixo — o TanStack Query casa
// chave por prefixo, então invalidar ['inventory'] invalida todas as páginas e
// as mutações abaixo não precisam saber em que página o usuário está.
export const inventoryKeys = {
  all: ['inventory'] as const,
  list: (params: ListParams) => ['inventory', 'list', params] as const,
  stats: () => ['inventory', 'stats'] as const,
};

export interface InventoryItemInput {
  name: string;
  category: string;
  description?: string;
  quantity?: number;
  status?: string;
  notes?: string;
}

export interface InventoryStats {
  total: number;
  byStatus: Record<string, number>;
}

export function useInventoryQuery(params: ListParams) {
  return useQuery({
    queryKey: inventoryKeys.list(params),
    queryFn: async () =>
      (await apiClient.get<ListEnvelope<InventoryItem>>('/inventory', { params })).data,
    // Sem isto a tabela pisca em branco a cada troca de página ou tecla da busca:
    // mantém o resultado anterior na tela enquanto o novo não chega.
    placeholderData: keepPreviousData,
  });
}

// Contadores do cabeçalho. Query própria porque `rows.length` conta só a página
// atual — com paginação, o total precisa vir do servidor.
export function useInventoryStatsQuery() {
  return useQuery({
    queryKey: inventoryKeys.stats(),
    queryFn: async () => (await apiClient.get<InventoryStats>('/inventory/stats')).data,
  });
}

// As mutações invalidam a listagem em vez de recarregar na mão: quem estiver
// mostrando a lista — nesta tela ou em outra — recebe o dado novo.
export function useCreateInventoryItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: InventoryItemInput) => apiClient.post('/inventory', data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: inventoryKeys.all }),
  });
}

export function useUpdateInventoryItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: InventoryItemInput }) =>
      apiClient.put(`/inventory/${id}`, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: inventoryKeys.all }),
  });
}

export function useRestoreInventoryItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.post(`/inventory/${id}/restore`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: inventoryKeys.all }),
  });
}

export function useDeleteInventoryItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/inventory/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: inventoryKeys.all }),
  });
}
