import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../core/api/apiClient';
import { assetKeys } from '../asset/asset.queries';
import type { UserHoldings } from '../shared/asset.types';
import type { AlvoDaPosse, Assignment } from '../shared/posse.types';

// A POSSE — Camada 1 de docs/MODELO-POSSE.md.
//
// Entregar e devolver são OPERAÇÕES, não edição de campo: não existe `useUpdate`
// aqui de propósito. Uma posse nasce no checkout e morre no checkin, e o
// histórico nunca é apagado.
//
// `all` é o prefixo: invalidar ['assignments'] alcança o histórico de um ativo E
// o que uma pessoa tem em posse, sem a mutação saber que tela está aberta.
export const assignmentKeys = {
  all: ['assignments'] as const,
  doAtivo: (assetId: string) => ['assignments', 'asset', assetId] as const,
  doUsuario: (userId: string) => ['assignments', 'user', userId] as const,
};

/**
 * Corpo de `POST /api/assets/:id/checkout`.
 *
 * As três FKs são nuláveis e só UMA vale: qual, o `targetType` diz. A coerência
 * entre as duas coisas é validada no servidor (`assertAlvoCoerente`) — aqui o
 * formulário manda só a que corresponde à aba escolhida.
 */
export interface CheckoutInput {
  targetType: AlvoDaPosse;
  targetUserId?: string;
  targetAssetId?: string;
  targetLocationId?: string;
  /** Em branco, o servidor decide (a entrega força o ativo para "em uso"). */
  statusId?: string;
  expectedCheckinAt?: string;
  checkoutNotes?: string;
}

/**
 * Corpo de `POST /api/assets/bulk-checkout` — o MESMO da entrega, mais a lista
 * de ativos. UM alvo para todos: é o kit de onboarding, não N entregas soltas.
 */
export interface BulkCheckoutInput extends CheckoutInput {
  assetIds: string[];
}

/** Uma entrega que deu certo, no relatório do lote. */
export interface EntregaFeita {
  assetId: string;
  assetTag: string;
  assignmentId: string;
}

/** Uma entrega recusada, com a frase que o servidor escreveu. */
export interface EntregaRecusada {
  assetId: string;
  erro: string;
}

/**
 * O relatório de `bulk-checkout` (D31).
 *
 * A entrega em massa é POR LINHA: um kit de 8 em que 1 está com outra pessoa
 * entrega 7 e recusa 1, e é este objeto que conta a história. Não existe "deu
 * erro" aqui — existe o que entrou e o que foi recusado, com motivo.
 */
export interface RelatorioEntregaEmLote {
  total: number;
  ok: EntregaFeita[];
  falhas: EntregaRecusada[];
}

/** Corpo de `POST /api/assets/:id/checkin`. */
export interface CheckinInput {
  /** Para que estado o ativo volta: estoque, conserto, inutilizável... */
  statusId?: string;
  checkinNotes?: string;
}

/** O histórico de posse de um ativo: a aberta primeiro, depois as fechadas. */
export function useAssetAssignmentsQuery(assetId: string | null) {
  return useQuery({
    queryKey: assignmentKeys.doAtivo(assetId ?? ''),
    queryFn: async () =>
      (await apiClient.get<Assignment[]>(`/assets/${assetId}/assignments`)).data,
    enabled: assetId != null,
  });
}

/** O que uma pessoa tem em posse: no nome dela e pelos postos que ela ocupa. */
export function useUserHoldingsQuery(userId: string | null) {
  return useQuery({
    queryKey: assignmentKeys.doUsuario(userId ?? ''),
    queryFn: async () =>
      (await apiClient.get<UserHoldings>(`/users/${userId}/holdings`)).data,
    enabled: userId != null,
  });
}

/**
 * Entregar.
 *
 * Invalida ativos TAMBÉM, e não só as posses: a coluna Responsável da listagem
 * e o status do ativo são consequência da entrega. Sem isto, a tabela continuaria
 * mostrando o dono anterior até o próximo refetch.
 */
export function useCheckoutAsset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: CheckoutInput }) =>
      apiClient.post(`/assets/${id}/checkout`, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: assignmentKeys.all });
      void queryClient.invalidateQueries({ queryKey: assetKeys.all });
    },
  });
}

/** Devolver. Fecha a posse aberta — não apaga linha nenhuma. */
export function useCheckinAsset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: CheckinInput }) =>
      apiClient.post(`/assets/${id}/checkin`, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: assignmentKeys.all });
      void queryClient.invalidateQueries({ queryKey: assetKeys.all });
    },
  });
}

/**
 * ENTREGAR EM MASSA — N ativos, um alvo, um relatório.
 *
 * A mutação NÃO rejeita quando parte das linhas falha: o servidor responde 200
 * com o relatório, e quem decide o que mostrar é a tela. Tratar recusa de linha
 * como erro de requisição jogaria fora a lista do que ENTROU — que é a metade
 * que o operador precisa para saber o que não refazer.
 *
 * Invalida posses e ativos pelo mesmo motivo da entrega avulsa: o responsável e
 * o status de N linhas da listagem mudaram de uma vez.
 */
export function useBulkCheckout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: BulkCheckoutInput) =>
      (await apiClient.post<RelatorioEntregaEmLote>('/assets/bulk-checkout', data)).data,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: assignmentKeys.all });
      void queryClient.invalidateQueries({ queryKey: assetKeys.all });
    },
  });
}
