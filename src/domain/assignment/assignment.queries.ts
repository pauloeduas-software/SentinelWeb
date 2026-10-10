import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../core/api/apiClient';
import { assetKeys } from '../asset/asset.queries';
// Quem PERGUNTA importa; o dono do dado é quem responde (docs/referencia/arquitetura.md).
// A posse precisa dizer ao posto que algo mudou nele, e a chave é do posto.
import { workstationKeys } from '../workstation/workstation.queries';
import type { AlvoDaPosse, Assignment } from '../shared/posse.types';

// A POSSE — Camada 1 de docs/referencia/modelo-de-posse.md.
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
  minhas: ['assignments', 'me'] as const,
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

/**
 * O QUE UMA ENTREGA OU UMA DEVOLUÇÃO MUDA NA TELA, num lugar só.
 *
 * Três domínios, e nenhum deles é opcional:
 *
 *   posses  — a linha que acabou de abrir ou fechar;
 *   ativos  — a coluna Responsável e o status são consequência da operação, e
 *             um ativo entregue a um posto SAI da listagem `/ativos`
 *             (`asset-filters.helper.ts`), então a tabela muda de tamanho;
 *   postos  — a ficha do posto lista os ativos entregues a ele, conta quantos
 *             são e deriva o selo de POSTO VAGO desses dois números.
 *
 * O terceiro não estava aqui, e não dava para notar: até esta etapa nenhuma
 * entrega ou devolução acontecia com uma tela de posto montada. A devolução
 * passou a morar DENTRO da ficha do posto, e aí a tabela de ativos, o contador e
 * o selo de vago estão todos na tela no instante em que a mutação volta — sem
 * esta linha, a linha devolvida continuaria na tabela e o selo seria calculado
 * sobre o número de antes.
 *
 * A entrega entra pelo mesmo caminho por simetria, e não por defeito observado:
 * entregar é feito em `/ativos`, com `/postos` desmontada, e `staleTime: 0` já
 * faz a ficha reler ao montar.
 *
 * É o mesmo desenho do `invalidarPosseDerivada` da ocupação, pelo mesmo motivo:
 * posse é um fato que três telas leem de ângulos diferentes.
 */
function invalidarAlvosDaPosse(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: assignmentKeys.all });
  void queryClient.invalidateQueries({ queryKey: assetKeys.all });
  void queryClient.invalidateQueries({ queryKey: workstationKeys.all });
}

/** Entregar. */
export function useCheckoutAsset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: CheckoutInput }) =>
      apiClient.post(`/assets/${id}/checkout`, data),
    onSuccess: () => invalidarAlvosDaPosse(queryClient),
  });
}

/** Devolver. Fecha a posse aberta — não apaga linha nenhuma. */
export function useCheckinAsset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: CheckinInput }) =>
      apiClient.post(`/assets/${id}/checkin`, data),
    onSuccess: () => invalidarAlvosDaPosse(queryClient),
  });
}

