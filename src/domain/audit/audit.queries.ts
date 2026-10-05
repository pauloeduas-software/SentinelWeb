import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../core/api/apiClient';
import { assetKeys } from '../asset/asset.queries';
import { workstationKeys } from '../workstation/workstation.queries';
import type {
  Auditoria, AuditoriaInput, ConferenciaDoPosto, ConferenciaInput, ResultadoDaConferencia,
} from '../shared/lifecycle.types';

// A CONFERÊNCIA FÍSICA (docs/historico/fase-08-ciclo-de-vida.md, Etapa B).

export const auditKeys = {
  all: ['audits'] as const,
  doAtivo: (assetId: string) => ['audits', 'do-ativo', assetId] as const,
  doPosto: (locationId: string) => ['audits', 'do-posto', locationId] as const,
};

export function useAssetAuditsQuery(assetId: string | null) {
  return useQuery({
    queryKey: auditKeys.doAtivo(assetId ?? ''),
    queryFn: async () => (await apiClient.get<Auditoria[]>(`/assets/${assetId}/audits`)).data,
    enabled: assetId != null,
  });
}

/** As duas listas do posto. A diferença entre elas é a divergência. */
export function useConferenciaDoPostoQuery(locationId: string | null) {
  return useQuery({
    queryKey: auditKeys.doPosto(locationId ?? ''),
    queryFn: async () =>
      (await apiClient.get<ConferenciaDoPosto>(`/locations/${locationId}/auditoria`)).data,
    enabled: locationId != null,
  });
}

/**
 * A conferência move `locationId` e escreve `lastAuditAt`: ativos, postos e
 * relatórios mudam juntos. Ela NUNCA muda a posse (D52), então `assignments` não
 * precisa de invalidação por causa dela — mas o ativo precisa, porque é a
 * localização dele que mudou.
 */
function invalidar(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: auditKeys.all });
  void queryClient.invalidateQueries({ queryKey: assetKeys.all });
  void queryClient.invalidateQueries({ queryKey: workstationKeys.all });
  void queryClient.invalidateQueries({ queryKey: ['reports'] });
  void queryClient.invalidateQueries({ queryKey: ['alerts'] });
}

export function useRecordAudit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ assetId, data }: { assetId: string; data: AuditoriaInput }) =>
      apiClient.post<Auditoria>(`/assets/${assetId}/audit`, data),
    onSuccess: () => invalidar(queryClient),
  });
}

/** Desempacota o corpo: a tela mostra os números da conferência que acabou. */
export function useAuditarPosto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ locationId, data }: { locationId: string; data: ConferenciaInput }) =>
      (await apiClient.post<ResultadoDaConferencia>(`/locations/${locationId}/auditoria`, data)).data,
    onSuccess: () => invalidar(queryClient),
  });
}
