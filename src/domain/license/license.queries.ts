import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../core/api/apiClient';
import { assetKeys } from '../asset/asset.queries';
import { personKeys } from '../person/person.queries';
import type { ListEnvelope, ListParams } from '../shared/list.types';
import type {
  AlertasDaLicenca, AlvoDaEntrega, EntregaComChave, EntregaDeLicenca, EntregaDoAlvo, EventoDaLicenca,
  Licenca, LicencaDetalhe, LicencaInput, RecorteDaLicenca, StatusDoFiltro,
} from '../shared/license.types';

// AS LICENÇAS DE SOFTWARE (docs/referencia/licencas.md).
//
// `['licenses']` é o prefixo, então invalidar depois de gravar alcança a
// listagem, o detalhe, as entregas, o histórico e os alertas — que mudam a cada
// entrega, sem ninguém ter tocado neles.

/** A listagem: o que toda lista aceita, a aba no lugar da lixeira, a categoria e o status. */
export type ParamsDaLicenca = Omit<ListParams, 'view'> & {
  view: RecorteDaLicenca;
  categoryId?: string;
  /** Só na aba Atuais — o servidor recusa com 422 em Encerradas. */
  status?: StatusDoFiltro;
  /** Só as que alguém ainda usa — para onde o alerta "encerradas em uso" leva. */
  emUso?: 'sim';
};

/** As duas listas do detalhe: a página e, na de entregas, a busca pelo nome. */
export interface ParamsDoDetalhe {
  page: number;
  perPage: number;
  q?: string;
}

const licenseKeys = {
  all: ['licenses'] as const,
  list: (params: ParamsDaLicenca) => ['licenses', 'list', params] as const,
  item: (id: string) => ['licenses', 'item', id] as const,
  entregas: (id: string, params: ParamsDoDetalhe) => ['licenses', 'entregas', id, params] as const,
  historico: (id: string, params: ParamsDoDetalhe) => ['licenses', 'historico', id, params] as const,
  alertas: () => ['licenses', 'alertas'] as const,
  /** O que está licenciado NUM ativo — a aba Licenças da tela do ativo. */
  doAtivo: (assetId: string) => ['licenses', 'do-ativo', assetId] as const,
};

export function useLicensesQuery(params: ParamsDaLicenca) {
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
    queryFn: async () => (await apiClient.get<LicencaDetalhe>(`/licenses/${id}`)).data,
    enabled: id != null,
  });
}

/** Quem está com a licença agora — por página, com busca pelo nome. */
export function useLicenseCheckoutsQuery(id: string | null, params: ParamsDoDetalhe) {
  return useQuery({
    queryKey: licenseKeys.entregas(id ?? '', params),
    queryFn: async () =>
      (await apiClient.get<ListEnvelope<EntregaComChave>>(`/licenses/${id}/checkouts`, { params })).data,
    enabled: id != null,
    // Sem isto a lista pisca em branco a cada página e a cada tecla da busca.
    placeholderData: keepPreviousData,
  });
}

/** Por onde a licença passou: as entregas e as devoluções, por página. */
export function useLicenseHistoryQuery(id: string | null, params: Omit<ParamsDoDetalhe, 'q'>) {
  return useQuery({
    queryKey: licenseKeys.historico(id ?? '', params),
    queryFn: async () =>
      (await apiClient.get<ListEnvelope<EventoDaLicenca>>(`/licenses/${id}/history`, { params })).data,
    enabled: id != null,
    placeholderData: keepPreviousData,
  });
}

export function useLicenseAlertsQuery() {
  return useQuery({
    queryKey: licenseKeys.alertas(),
    queryFn: async () => (await apiClient.get<AlertasDaLicenca>('/licenses/alerts')).data,
  });
}

export function useAssetLicensesQuery(assetId: string | null) {
  return useQuery({
    queryKey: licenseKeys.doAtivo(assetId ?? ''),
    queryFn: async () =>
      (await apiClient.get<EntregaDoAlvo[]>(`/assets/${assetId}/licenses`)).data,
    enabled: assetId != null,
  });
}

/**
 * Por que toda mutação daqui invalida ativos e colaboradores, e não só licenças.
 *
 * A licença entregue é POSSE (D93): entregá-la a alguém muda a ficha daquela
 * pessoa, o histórico dela e o 409 da desativação; entregá-la a uma máquina
 * muda a aba Licenças e o histórico do ativo. Operação que atravessa domínios
 * invalida os dois lados.
 */
function invalidarLicencaEPosse(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: licenseKeys.all });
  void queryClient.invalidateQueries({ queryKey: assetKeys.all });
  void queryClient.invalidateQueries({ queryKey: personKeys.all });
}

export function useCreateLicense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: LicencaInput) => apiClient.post<Licenca>('/licenses', data),
    onSuccess: () => invalidarLicencaEPosse(queryClient),
  });
}

/** Manda SÓ o que mudou: um formulário aberto há tempo não desfaz a edição de outro. */
export function useUpdateLicense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<LicencaInput> }) =>
      apiClient.put<Licenca>(`/licenses/${id}`, data),
    onSuccess: () => invalidarLicencaEPosse(queryClient),
  });
}

/** Exclusão DEFINITIVA — para o cadastro errado. */
export function useDeleteLicense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/licenses/${id}`),
    onSuccess: () => invalidarLicencaEPosse(queryClient),
  });
}

/** Encerrar: o contrato acabou, a licença vai para a aba Encerradas. */
export function useTerminateLicense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.post<Licenca>(`/licenses/${id}/terminate`),
    onSuccess: () => invalidarLicencaEPosse(queryClient),
  });
}

/** A ENTREGA, a um colaborador OU a um ativo. */
export function useCheckoutLicense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ licenseId, alvo }: { licenseId: string; alvo: AlvoDaEntrega }) =>
      apiClient.post<EntregaDeLicenca>(`/licenses/${licenseId}/checkout`, alvo),
    onSuccess: () => invalidarLicencaEPosse(queryClient),
  });
}

/** A devolução, pela ENTREGA — nunca pela licença ou pelo alvo. */
export function useCheckinLicense() {
  const queryClient = useQueryClient();
  return useMutation({
    /** `checkinAt` é o dia da devolução, 'AAAA-MM-DD': hoje ou antes, nunca antes da entrega. */
    mutationFn: ({ checkoutId, checkinAt }: { checkoutId: string; checkinAt: string }) =>
      apiClient.post<EntregaDeLicenca>(`/licenses/checkouts/${checkoutId}/checkin`, { checkinAt }),
    onSuccess: () => invalidarLicencaEPosse(queryClient),
  });
}

/** Troca só a chave de uma entrega aberta — o "Com quem está" do detalhe. */
export function useUpdateCheckoutKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ checkoutId, productKey }: { checkoutId: string; productKey: string | null }) =>
      apiClient.patch<EntregaComChave>(`/licenses/checkouts/${checkoutId}`, { productKey }),
    onSuccess: () => invalidarLicencaEPosse(queryClient),
  });
}
