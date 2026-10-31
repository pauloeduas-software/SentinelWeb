import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../api/apiClient';
import { assetKeys } from './asset.queries';
import { personKeys } from './person.queries';
import type { ListEnvelope, ListParams } from '../types/list.types';
import type {
  AlertasDaLicenca, AlvoDaEntrega, EntregaComChave, EntregaDeLicenca, EntregaDoAlvo, EventoDaLicenca,
  Licenca, LicencaDetalhe, LicencaInput, StatusDoFiltro,
} from '../types/license.types';

// AS LICENÇAS DE SOFTWARE (docs/referencia/licencas.md).
//
// `['licenses']` é o prefixo, então invalidar depois de gravar alcança a
// listagem, o detalhe, as entregas, o histórico e os alertas — que mudam a cada
// entrega, sem ninguém ter tocado neles.

/** A listagem: o que toda lista aceita, sem lixeira nem abas (AF), a categoria e o status. */
export type ParamsDaLicenca = Omit<ListParams, 'view'> & {
  categoryId?: string;
  status?: StatusDoFiltro;
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
 *
 * Devolve a promessa, e o `onSettled` a devolve também: a mutação só termina
 * quando as listas abertas já foram buscadas de novo. Sem isso o botão
 * destravava com a linha devolvida, encerrada ou excluída ainda na tela, e o
 * segundo clique dava "já foi devolvida".
 *
 * NO ERRO TAMBÉM (`onSettled`): o 409 quase sempre quer dizer que a tela está
 * velha — outra pessoa devolveu, entregou ou encerrou no meio. Sem buscar de
 * novo, a linha continuava oferecendo o que o servidor acabou de recusar.
 *
 * `excluida`: a licença que acabou de ser apagada. As consultas DELA ficam de
 * fora — buscá-las de novo é um 404 garantido, que a janela do detalhe ainda
 * aberta mostrava antes de fechar.
 */
function invalidarLicencaEPosse(queryClient: ReturnType<typeof useQueryClient>, excluida?: string) {
  return Promise.all([
    queryClient.invalidateQueries({
      queryKey: licenseKeys.all,
      predicate: (consulta) => excluida === undefined || consulta.queryKey[2] !== excluida,
    }),
    queryClient.invalidateQueries({ queryKey: assetKeys.all }),
    queryClient.invalidateQueries({ queryKey: personKeys.all }),
  ]);
}

export function useCreateLicense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: LicencaInput) => apiClient.post<Licenca>('/licenses', data),
    onSettled: () => invalidarLicencaEPosse(queryClient),
  });
}

/** O formulário inteiro (AF), com a versão que ele leu: o aberto há tempo recebe 409, e não grava por cima. */
export function useUpdateLicense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<LicencaInput> }) =>
      apiClient.put<Licenca>(`/licenses/${id}`, data),
    onSettled: () => invalidarLicencaEPosse(queryClient),
  });
}

/** Exclusão DEFINITIVA — para o cadastro errado. */
export function useDeleteLicense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/licenses/${id}`),
    onSettled: (_resposta, erro, id) => invalidarLicencaEPosse(queryClient, erro ? undefined : id),
  });
}

/** Encerrar: o contrato acabou — a licença fica na lista, esmaecida, e não recebe nada novo. */
export function useTerminateLicense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.post<Licenca>(`/licenses/${id}/terminate`),
    onSettled: () => invalidarLicencaEPosse(queryClient),
  });
}

/** A ENTREGA, a um colaborador OU a um ativo. */
export function useCheckoutLicense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ licenseId, alvo }: { licenseId: string; alvo: AlvoDaEntrega }) =>
      apiClient.post<EntregaDeLicenca>(`/licenses/${licenseId}/checkout`, alvo),
    onSettled: () => invalidarLicencaEPosse(queryClient),
  });
}

/** A devolução, pela ENTREGA — nunca pela licença ou pelo alvo. */
export function useCheckinLicense() {
  const queryClient = useQueryClient();
  return useMutation({
    /** `checkinAt` é o dia da devolução, 'AAAA-MM-DD': hoje ou antes, nunca antes da entrega. */
    mutationFn: ({ checkoutId, checkinAt }: { checkoutId: string; checkinAt: string }) =>
      apiClient.post<EntregaDeLicenca>(`/licenses/checkouts/${checkoutId}/checkin`, { checkinAt }),
    onSettled: () => invalidarLicencaEPosse(queryClient),
  });
}

/** Troca só a chave de uma entrega aberta, por outra da lista — o "Com quem está" do detalhe. */
export function useUpdateCheckoutKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ checkoutId, licenseKeyId }: { checkoutId: string; licenseKeyId: string }) =>
      apiClient.patch<EntregaComChave>(`/licenses/checkouts/${checkoutId}`, { licenseKeyId }),
    onSettled: () => invalidarLicencaEPosse(queryClient),
  });
}
