import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../core/api/apiClient';
import { assetKeys } from '../asset/asset.queries';
import { assignmentKeys } from '../assignment/assignment.queries';
import { workstationKeys } from '../workstation/workstation.queries';
import type { ListEnvelope, ListParams } from '../shared/list.types';
import type {
  AlertasDeEstoque, EntregaDeAcessorio, InstalacaoDeComponente,
  ItemDeEstoque, MotivoDoAjuste, MovimentoDoItem, StockSlug,
} from '../shared/stock.types';

// O ESTOQUE — acessórios, consumíveis e componentes (docs/FASE-5-PLANO-ITAM.md).
//
// A chave inclui o SLUG porque as três abas são três tabelas: sem ele, abrir
// "Consumíveis" serviria a lista de acessórios do cache. `['stock']` continua
// sendo o prefixo, então invalidar depois de gravar alcança as três e também os
// alertas — que mudam a cada entrega, sem ninguém ter tocado neles.

export const stockKeys = {
  all: ['stock'] as const,
  list: (slug: StockSlug, params: ListParams) => ['stock', slug, 'list', params] as const,
  item: (slug: StockSlug, id: string) => ['stock', slug, 'item', id] as const,
  movimentos: (slug: StockSlug, id: string) => ['stock', slug, 'movimentos', id] as const,
  entregas: (accessoryId: string) => ['stock', 'accessories', 'entregas', accessoryId] as const,
  alertas: () => ['stock', 'alertas'] as const,
  /** O que está DENTRO de um ativo — a aba Componentes da tela do ativo. */
  doAtivo: (assetId: string) => ['stock', 'components', 'do-ativo', assetId] as const,
};

export function useStockListQuery(slug: StockSlug, params: ListParams) {
  return useQuery({
    queryKey: stockKeys.list(slug, params),
    queryFn: async () =>
      (await apiClient.get<ListEnvelope<ItemDeEstoque>>(`/${slug}`, { params })).data,
    // Sem isto a tabela pisca em branco a cada troca de página, de aba ou tecla
    // da busca.
    placeholderData: keepPreviousData,
  });
}

export function useStockItemQuery(slug: StockSlug, id: string | null) {
  return useQuery({
    queryKey: stockKeys.item(slug, id ?? ''),
    queryFn: async () => (await apiClient.get<ItemDeEstoque>(`/${slug}/${id}`)).data,
    enabled: id != null,
  });
}

/** A movimentação: saídas e ajustes na mesma linha do tempo. */
export function useStockMovementsQuery(slug: StockSlug, id: string | null) {
  return useQuery({
    queryKey: stockKeys.movimentos(slug, id ?? ''),
    queryFn: async () => (await apiClient.get<MovimentoDoItem[]>(`/${slug}/${id}/movements`)).data,
    enabled: id != null,
  });
}

/** As unidades de acessório que estão fora — é daqui que sai o botão "devolver". */
export function useAccessoryCheckoutsQuery(accessoryId: string | null) {
  return useQuery({
    queryKey: stockKeys.entregas(accessoryId ?? ''),
    queryFn: async () =>
      (await apiClient.get<EntregaDeAcessorio[]>(`/accessories/${accessoryId}/checkouts`)).data,
    enabled: accessoryId != null,
  });
}

export function useStockAlertsQuery() {
  return useQuery({
    queryKey: stockKeys.alertas(),
    queryFn: async () => (await apiClient.get<AlertasDeEstoque>('/stock/alerts')).data,
  });
}

/** O que está dentro de um ativo AGORA — só as instalações abertas. */
export function useAssetComponentsQuery(assetId: string | null) {
  return useQuery({
    queryKey: stockKeys.doAtivo(assetId ?? ''),
    queryFn: async () =>
      (await apiClient.get<InstalacaoDeComponente[]>(`/assets/${assetId}/components`)).data,
    enabled: assetId != null,
  });
}

/**
 * Por que TODA mutação daqui invalida ativos, posses e postos, e não só estoque.
 *
 * O estoque atravessa as três camadas do docs/MODELO-POSSE.md desde a F5:
 * entregar um mouse à Mesa 1 muda o que a tela do POSTO mostra e o `holdings`
 * de cada OCUPANTE dela, sem nenhum ativo ter sido tocado; instalar um pente
 * muda a aba Componentes do ATIVO. Invalidar só `stock` deixaria essas telas
 * mentindo até o próximo refetch — o mesmo raciocínio do
 * `invalidarPosseDerivada` da ocupação.
 */
function invalidarEstoqueEPosse(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: stockKeys.all });
  void queryClient.invalidateQueries({ queryKey: assignmentKeys.all });
  void queryClient.invalidateQueries({ queryKey: assetKeys.all });
  void queryClient.invalidateQueries({ queryKey: workstationKeys.all });
}

/**
 * Corpo do cadastro e da edição.
 *
 * `qty` está aqui como OPCIONAL porque só a criação a aceita: no `PUT` o
 * servidor responde 422 à chave (o `strictObject` não a declara), e é assim que
 * a quantidade deixa de ser campo de formulário. A tela não manda `qty` ao
 * editar — quem muda quantidade é o ajuste.
 */
export interface ItemDeEstoqueInput {
  name: string;
  categoryId: string;
  qty?: number;
  minQty?: number | null;
  modelNumber?: string | null;
  serial?: string | null;
  manufacturerId?: string | null;
  supplierId?: string | null;
  locationId?: string | null;
  orderNumber?: string | null;
  purchaseDate?: string | null;
  /** STRING do começo ao fim — nunca `number` (ver stock.types.ts). */
  purchaseCost?: string | null;
  notes?: string | null;
}

export function useCreateStockItem(slug: StockSlug) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: ItemDeEstoqueInput) => apiClient.post(`/${slug}`, data),
    onSuccess: () => invalidarEstoqueEPosse(queryClient),
  });
}

export function useUpdateStockItem(slug: StockSlug) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: ItemDeEstoqueInput }) =>
      apiClient.put(`/${slug}/${id}`, data),
    onSuccess: () => invalidarEstoqueEPosse(queryClient),
  });
}

export function useDeleteStockItem(slug: StockSlug) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/${slug}/${id}`),
    onSuccess: () => invalidarEstoqueEPosse(queryClient),
  });
}

export function useRestoreStockItem(slug: StockSlug) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.post(`/${slug}/${id}/restore`),
    onSuccess: () => invalidarEstoqueEPosse(queryClient),
  });
}

export interface AjusteInput {
  /** Quanto SOMAR. Negativo é baixa. Nunca o valor final (D34). */
  delta: number;
  reason: MotivoDoAjuste;
  notes?: string;
}

export function useAdjustStockQuantity(slug: StockSlug) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: AjusteInput }) =>
      apiClient.post(`/${slug}/${id}/adjust-quantity`, data),
    onSuccess: () => invalidarEstoqueEPosse(queryClient),
  });
}

/** A ENTREGA de UMA unidade de acessório — a pessoa ou ao posto (D33). */
export interface EntregaInput {
  targetType: 'USER' | 'LOCATION';
  targetUserId?: string;
  targetLocationId?: string;
  expectedCheckinAt?: string;
  notes?: string;
}

export function useCheckoutAccessory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: EntregaInput }) =>
      apiClient.post(`/accessories/${id}/checkout`, data),
    onSuccess: () => invalidarEstoqueEPosse(queryClient),
  });
}

export function useCheckinAccessory() {
  const queryClient = useQueryClient();
  return useMutation({
    // O `:id` aqui é o da ENTREGA, não o do acessório: a devolução é de UMA
    // unidade identificada.
    mutationFn: ({ checkoutId, notes }: { checkoutId: string; notes?: string }) =>
      apiClient.post(`/accessories/checkouts/${checkoutId}/checkin`, { notes }),
    onSuccess: () => invalidarEstoqueEPosse(queryClient),
  });
}

/**
 * O CONSUMO. Não existe mutação de devolução neste arquivo, e não é esquecimento
 * (D37): não há rota, não há coluna, e o checkin responde 404 do roteador.
 */
export function useConsumeConsumable() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: { userId: string; qty: number; notes?: string } }) =>
      apiClient.post(`/consumables/${id}/consume`, data),
    onSuccess: () => invalidarEstoqueEPosse(queryClient),
  });
}

export function useAttachComponent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: { assetId: string; qty: number; notes?: string } }) =>
      apiClient.post(`/components/${id}/attach`, data),
    onSuccess: () => invalidarEstoqueEPosse(queryClient),
  });
}

/** A retirada, total ou PARCIAL — parcial divide a linha no servidor (D38). */
export function useDetachComponent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ instalacaoId, qty }: { instalacaoId: string; qty?: number }) =>
      apiClient.post(`/components/attachments/${instalacaoId}/detach`, qty ? { qty } : {}),
    onSuccess: () => invalidarEstoqueEPosse(queryClient),
  });
}
