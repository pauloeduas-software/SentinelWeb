import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../core/api/apiClient';
import { assetKeys } from '../asset/asset.queries';
import { userKeys } from '../user/user.queries';
import type { ListEnvelope, ListParams } from '../shared/list.types';
import type {
  AlertasDeLicenca, AlvoDoAssento, AssentoDeLicenca, ChaveRevelada,
  EntregaDeAssento, EventoDaLicenca, Licenca, LicencaDoAtivo, LicencaInput,
  ResultadoDaDevolucao,
} from '../shared/license.types';

// AS LICENÇAS DE SOFTWARE (docs/FASE-6-PLANO-ITAM.md).
//
// `['licenses']` é o prefixo, então invalidar depois de gravar alcança a
// listagem, o detalhe, a grade de assentos e os alertas — que mudam a cada
// entrega, sem ninguém ter tocado neles.

export const licenseKeys = {
  all: ['licenses'] as const,
  list: (params: ListParams) => ['licenses', 'list', params] as const,
  item: (id: string) => ['licenses', 'item', id] as const,
  seats: (id: string) => ['licenses', 'seats', id] as const,
  historico: (id: string) => ['licenses', 'historico', id] as const,
  alertas: () => ['licenses', 'alertas'] as const,
  /** O que está licenciado NUM ativo — a aba Licenças da tela do ativo. */
  doAtivo: (assetId: string) => ['licenses', 'do-ativo', assetId] as const,
};

export function useLicensesQuery(params: ListParams) {
  return useQuery({
    queryKey: licenseKeys.list(params),
    queryFn: async () => (await apiClient.get<ListEnvelope<Licenca>>('/licenses', { params })).data,
    // Sem isto a tabela pisca em branco a cada troca de página ou tecla da busca.
    placeholderData: keepPreviousData,
  });
}

export function useLicenseQuery(id: string | null) {
  return useQuery({
    queryKey: licenseKeys.item(id ?? ''),
    queryFn: async () => (await apiClient.get<Licenca>(`/licenses/${id}`)).data,
    enabled: id != null,
  });
}

/** A grade de assentos: livre · pessoa · ativo · queimado · aposentado. */
export function useLicenseSeatsQuery(id: string | null) {
  return useQuery({
    queryKey: licenseKeys.seats(id ?? ''),
    queryFn: async () => (await apiClient.get<AssentoDeLicenca[]>(`/licenses/${id}/seats`)).data,
    enabled: id != null,
  });
}

/**
 * A TRILHA DA LICENÇA — e é a única tela que responde "quem viu esta chave?".
 *
 * `VIEW_KEY` é a primeira ação do projeto que registra uma LEITURA, e ela só
 * serve para alguma coisa se alguém puder lê-la: o log existir sem tela é o
 * mesmo que não existir, porque a pergunta que ele responde ninguém consegue
 * fazer. Entra aqui junto das entregas, devoluções e queimas — a trilha é uma
 * (D18), não uma por tipo de evento.
 */
export function useLicenseHistoryQuery(id: string | null) {
  return useQuery({
    queryKey: licenseKeys.historico(id ?? ''),
    queryFn: async () =>
      (await apiClient.get<EventoDaLicenca[]>(`/licenses/${id}/history`)).data,
    enabled: id != null,
  });
}

export function useLicenseAlertsQuery() {
  return useQuery({
    queryKey: licenseKeys.alertas(),
    queryFn: async () => (await apiClient.get<AlertasDeLicenca>('/licenses/alerts')).data,
  });
}

export function useAssetLicensesQuery(assetId: string | null) {
  return useQuery({
    queryKey: licenseKeys.doAtivo(assetId ?? ''),
    queryFn: async () =>
      (await apiClient.get<LicencaDoAtivo[]>(`/assets/${assetId}/licenses`)).data,
    enabled: assetId != null,
  });
}

/**
 * Por que toda mutação daqui invalida ativos e usuários, e não só licenças.
 *
 * O assento é POSSE (D93): entregá-lo a alguém muda o `holdings` daquela pessoa
 * e o 409 do `DELETE` dela; entregá-lo a uma máquina muda a aba Licenças do
 * ativo e o 409 do `DELETE` dele. Invalidar só `licenses` deixaria essas telas
 * mentindo até o próximo refetch — o mesmo raciocínio do
 * `invalidarEstoqueEPosse` da F5.
 */
function invalidarLicencaEPosse(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: licenseKeys.all });
  void queryClient.invalidateQueries({ queryKey: assetKeys.all });
  void queryClient.invalidateQueries({ queryKey: userKeys.all });
}

export function useCreateLicense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: LicencaInput) => apiClient.post<Licenca>('/licenses', data),
    onSuccess: () => invalidarLicencaEPosse(queryClient),
  });
}

export function useUpdateLicense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<LicencaInput> }) =>
      apiClient.put<Licenca>(`/licenses/${id}`, data),
    onSuccess: () => invalidarLicencaEPosse(queryClient),
  });
}

export function useDeleteLicense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/licenses/${id}`),
    onSuccess: () => invalidarLicencaEPosse(queryClient),
  });
}

export function useRestoreLicense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.post(`/licenses/${id}/restore`),
    onSuccess: () => invalidarLicencaEPosse(queryClient),
  });
}

/**
 * A ENTREGA. Sem `seatId` no corpo — quem escolhe o assento é o SERVIDOR.
 *
 * Deixar a tela escolher reabriria a corrida inteira: duas telas mostrando
 * "assento 3 livre" mandariam as duas o mesmo número.
 */
export function useCheckoutSeat() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ licenseId, alvo }: { licenseId: string; alvo: AlvoDoAssento }) =>
      apiClient.post<EntregaDeAssento>(`/licenses/${licenseId}/checkout-seat`, alvo),
    onSuccess: () => invalidarLicencaEPosse(queryClient),
  });
}

/** O `seatId` é o do ASSENTO: a tela tem a grade na mão e clica no quadrado. */
export function useCheckinSeat() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ seatId, notes }: { seatId: string; notes?: string | null }) =>
      apiClient.post<ResultadoDaDevolucao>(`/licenses/seats/${seatId}/checkin`, { notes }),
    onSuccess: () => invalidarLicencaEPosse(queryClient),
  });
}

/**
 * REVELAR A CHAVE — `useMutation` num GET, e é de propósito.
 *
 * `useQuery` cacheia e refaz a busca sozinho: a chave ficaria no cache do
 * TanStack, e cada refetch automático gravaria mais um `VIEW_KEY` no
 * `ActivityLog` — a trilha de "quem viu o segredo" encheria de leituras que
 * ninguém pediu, e a única pergunta que ela existe para responder ficaria
 * afogada.
 *
 * Como mutação, ela só dispara no clique, não é cacheada, e o componente que a
 * chama guarda o valor em `useState` — que some quando o modal fecha.
 */
export function useRevealProductKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (licenseId: string) =>
      (await apiClient.get<ChaveRevelada>(`/licenses/${licenseId}/product-key`)).data,
    // A trilha ganhou uma linha `VIEW_KEY`: a aba Histórico precisa saber.
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: licenseKeys.all }),
  });
}
