import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../core/api/apiClient';
import { assetKeys } from '../asset/asset.queries';
import type { ListParams } from '../shared/list.types';
import type {
  EncerramentoInput, FiltrosDeManutencao, ListaDeManutencoes, Manutencao, ManutencaoInput,
} from '../shared/lifecycle.types';

// AS MANUTENÇÕES (docs/FASE-8-PLANO-ITAM.md, Etapa A).
//
// `['maintenances']` é o prefixo, então invalidar depois de gravar alcança a
// listagem global, o resumo do cabeçalho e a aba do ativo — os três mudam a cada
// encerramento, sem ninguém ter tocado neles.

type Params = ListParams & FiltrosDeManutencao;

export const maintenanceKeys = {
  all: ['maintenances'] as const,
  list: (params: Params) => ['maintenances', 'list', params] as const,
  doAtivo: (assetId: string) => ['maintenances', 'do-ativo', assetId] as const,
};

export function useMaintenancesQuery(params: Params) {
  return useQuery({
    queryKey: maintenanceKeys.list(params),
    queryFn: async () =>
      (await apiClient.get<ListaDeManutencoes>('/maintenances', { params })).data,
    // Sem isto a tabela pisca em branco a cada troca de página ou tecla da busca.
    placeholderData: keepPreviousData,
  });
}

/** A aba Manutenções da tela do ativo — tudo, aberta e encerrada, sem paginação. */
export function useAssetMaintenancesQuery(assetId: string | null) {
  return useQuery({
    queryKey: maintenanceKeys.doAtivo(assetId ?? ''),
    queryFn: async () =>
      (await apiClient.get<Manutencao[]>(`/assets/${assetId}/maintenances`)).data,
    enabled: assetId != null,
  });
}

/**
 * Por que toda mutação daqui invalida ATIVOS também.
 *
 * O `SERVICE`/`SERVICE_CLOSE` entra na aba Histórico do ativo na mesma transação
 * (record-activity), e o relatório de manutenções muda junto. Invalidar só
 * `maintenances` deixaria a linha do tempo do ativo mentindo até o próximo
 * refetch — o mesmo raciocínio do `invalidarLicencaEPosse` da F6.
 */
function invalidar(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: maintenanceKeys.all });
  void queryClient.invalidateQueries({ queryKey: assetKeys.all });
  void queryClient.invalidateQueries({ queryKey: ['reports'] });
}

/** O `:id` é o do ATIVO: manutenção nasce sempre pendurada num. */
export function useCreateMaintenance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ assetId, data }: { assetId: string; data: ManutencaoInput }) =>
      apiClient.post<Manutencao>(`/assets/${assetId}/maintenances`, data),
    onSuccess: () => invalidar(queryClient),
  });
}

export function useUpdateMaintenance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<ManutencaoInput> }) =>
      apiClient.put<Manutencao>(`/maintenances/${id}`, data),
    onSuccess: () => invalidar(queryClient),
  });
}

/** O encerramento: um clique, e o servidor usa hoje quando a data não vem. */
export function useCloseMaintenance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: EncerramentoInput }) =>
      apiClient.post<Manutencao>(`/maintenances/${id}/close`, data),
    onSuccess: () => invalidar(queryClient),
  });
}

/** `DELETE` de verdade: a tabela não tem lixeira. Quem avisa é a confirmação. */
export function useDeleteMaintenance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/maintenances/${id}`),
    onSuccess: () => invalidar(queryClient),
  });
}
