import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../api/apiClient';
import { assetKeys } from './asset.queries';
import { personKeys } from './person.queries';
import { workstationKeys } from './workstation.queries';
import type { ListEnvelope, ListParams } from '../types/list.types';
import type {
  AlvoDaEntregaDeEstoque, EventoDoItem, ItemDeEstoque, ItemDeEstoqueInput,
  ResultadoDaDevolucao, EntregaAberta, EntregaNaFicha,
} from '../types/stock.types';

// O ESTOQUE — monitor, teclado, mouse, cabo: o que tem quantidade e não
// patrimônio (docs/decisoes/estoque.md). A mesma forma da licença (AE).
//
// `['stock']` é o prefixo, então invalidar depois de gravar alcança a
// listagem, o detalhe, com quem está, o histórico e a aba Componentes do
// computador — e a entrega e a devolução invalidam também COLABORADORES (a
// unidade no nome de alguém trava a desativação dele), POSTOS (a ficha mostra o
// estoque da mesa) e COMPUTADORES (o histórico mostra o componente, AI).

/** A listagem: o que toda lista aceita, sem lixeira e sem abas, e a categoria. */
export type ParamsDoEstoque = Omit<ListParams, 'view'> & {
  categoryId?: string;
};

/** As duas listas do detalhe: a página e, na de quem está com o item, a busca pelo nome. */
export interface ParamsDoDetalhe {
  page: number;
  perPage: number;
  q?: string;
}

const stockKeys = {
  all: ['stock'] as const,
  list: (params: ParamsDoEstoque) => ['stock', 'list', params] as const,
  item: (id: string) => ['stock', 'item', id] as const,
  entregas: (id: string, params: ParamsDoDetalhe) => ['stock', 'entregas', id, params] as const,
  historico: (id: string, params: ParamsDoDetalhe) => ['stock', 'historico', id, params] as const,
  doAtivo: (assetId: string) => ['stock', 'do-ativo', assetId] as const,
};

export function useStockQuery(params: ParamsDoEstoque) {
  return useQuery({
    queryKey: stockKeys.list(params),
    queryFn: async () => (await apiClient.get<ListEnvelope<ItemDeEstoque>>('/stock/items', { params })).data,
    // Sem isto a tabela pisca em branco a cada troca de página, de filtro ou tecla da busca.
    placeholderData: keepPreviousData,
  });
}

export function useStockItemQuery(id: string | null) {
  return useQuery({
    queryKey: stockKeys.item(id ?? ''),
    queryFn: async () => (await apiClient.get<ItemDeEstoque>(`/stock/items/${id}`)).data,
    enabled: id != null,
  });
}

/** Quem está com o item agora — as entregas abertas, por página, com busca pelo nome. */
export function useStockCheckoutsQuery(id: string | null, params: ParamsDoDetalhe) {
  return useQuery({
    queryKey: stockKeys.entregas(id ?? '', params),
    queryFn: async () =>
      (await apiClient.get<ListEnvelope<EntregaAberta>>(`/stock/items/${id}/checkouts`, { params })).data,
    enabled: id != null,
    // Sem isto a lista pisca em branco a cada página e a cada tecla da busca.
    placeholderData: keepPreviousData,
  });
}

/** Por onde o item passou: as entregas e as devoluções, por página. */
export function useStockHistoryQuery(id: string | null, params: Omit<ParamsDoDetalhe, 'q'>) {
  return useQuery({
    queryKey: stockKeys.historico(id ?? '', params),
    queryFn: async () =>
      (await apiClient.get<ListEnvelope<EventoDoItem>>(`/stock/items/${id}/history`, { params })).data,
    enabled: id != null,
    placeholderData: keepPreviousData,
  });
}

/** Os componentes instalados num computador — a aba Componentes (AI). */
export function useAssetComponentsQuery(assetId: string | null) {
  return useQuery({
    queryKey: stockKeys.doAtivo(assetId ?? ''),
    queryFn: async () => (await apiClient.get<EntregaNaFicha[]>(`/assets/${assetId}/components`)).data,
    enabled: assetId != null,
  });
}

/**
 * Devolve a promessa, e o `onSettled` a devolve também: a mutação só termina
 * quando as listas abertas já foram buscadas de novo. Sem isso o botão
 * destravava com a entrega devolvida ainda na tela, e o segundo clique dava "já
 * foi devolvida" — o mesmo cuidado do `invalidarLicencaEPosse`, que explica o
 * erro (`onSettled`) e a `excluida`.
 */
function invalidarEstoqueEPosse(queryClient: ReturnType<typeof useQueryClient>, excluida?: string) {
  return Promise.all([
    queryClient.invalidateQueries({
      queryKey: stockKeys.all,
      predicate: (consulta) => excluida === undefined || consulta.queryKey[2] !== excluida,
    }),
    queryClient.invalidateQueries({ queryKey: personKeys.all }),
    queryClient.invalidateQueries({ queryKey: workstationKeys.all }),
    queryClient.invalidateQueries({ queryKey: assetKeys.all }),
  ]);
}

export function useCreateStockItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: ItemDeEstoqueInput) => apiClient.post<ItemDeEstoque>('/stock/items', data),
    onSettled: () => invalidarEstoqueEPosse(queryClient),
  });
}

/**
 * O formulário inteiro (AF), com a versão que ele leu, como na licença;
 * `isActive` sozinho é o Desativar e o Ativar, e não confere versão.
 */
export function useUpdateStockItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<ItemDeEstoqueInput> & { isActive?: boolean } }) =>
      apiClient.put<ItemDeEstoque>(`/stock/items/${id}`, data),
    onSettled: () => invalidarEstoqueEPosse(queryClient),
  });
}

/** Exclusão DEFINITIVA — para o cadastro errado. */
export function useDeleteStockItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/stock/items/${id}`),
    onSettled: (_resposta, erro, id) => invalidarEstoqueEPosse(queryClient, erro ? undefined : id),
  });
}

/** A ENTREGA: `qty` unidades a um colaborador ou a um posto, num dia. */
export function useCheckoutStock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, alvo }: { itemId: string; alvo: AlvoDaEntregaDeEstoque }) =>
      apiClient.post(`/stock/items/${itemId}/checkout`, alvo),
    onSettled: () => invalidarEstoqueEPosse(queryClient),
  });
}

/** A devolução, pela ENTREGA — `entregaId` é o de qualquer unidade dela. */
export function useCheckinStock() {
  const queryClient = useQueryClient();
  return useMutation({
    /** `checkinAt` é o dia, 'AAAA-MM-DD': hoje ou antes, nunca antes da entrega. */
    mutationFn: ({ entregaId, qty, checkinAt }: { entregaId: string; qty: number; checkinAt: string }) =>
      apiClient.post<ResultadoDaDevolucao>(`/stock/checkouts/${entregaId}/checkin`, { qty, checkinAt }),
    onSettled: () => invalidarEstoqueEPosse(queryClient),
  });
}
