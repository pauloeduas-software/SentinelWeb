import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../core/api/apiClient';
import { assetKeys } from '../asset/asset.queries';
import { endpointKeys } from '../endpoint/endpoint.queries';
import type { ListEnvelope } from '../shared/list.types';
import { licenseKeys } from '../license/license.queries';
import type {
  AtivoOcioso, Cobertura, Conformidade, ConfiguracaoDaDescoberta, MaquinaDoAtivo,
  PacoteDoCatalogo, ReviewState, Sugestao, SuggestionKind,
} from '../shared/reconciliation.types';

// A CONVERGÊNCIA RMM × ITAM (docs/FASE-7-PLANO-ITAM.md).
//
// `['reconciliation']` é o prefixo, então invalidar depois de resolver uma
// sugestão alcança a fila E o painel de cobertura — que muda a cada aceite sem
// ninguém ter tocado nele.
//
// E o invalidate vai ALÉM do prefixo, de propósito: aceitar uma sugestão pode
// abrir posse, mover um ativo entre camadas do modelo e criar ocupação. Quem
// não invalidasse `assets` e `endpoints` junto deixaria a tela do ativo
// mostrando o dono antigo até alguém recarregar a página.

export const reconciliationKeys = {
  all: ['reconciliation'] as const,
  sugestoes: (kind?: SuggestionKind) => ['reconciliation', 'sugestoes', kind ?? 'todas'] as const,
  cobertura: () => ['reconciliation', 'cobertura'] as const,
  ociosos: (dias: number) => ['reconciliation', 'ociosos', dias] as const,
  configuracao: () => ['reconciliation', 'configuracao'] as const,
  maquinaDoAtivo: (assetId: string) => ['reconciliation', 'maquina', assetId] as const,
  conformidade: (licenseId: string) => ['reconciliation', 'conformidade', licenseId] as const,
  softwareDaLicenca: (licenseId: string) => ['reconciliation', 'licenca-software', licenseId] as const,
  pacotes: (busca: string) => ['reconciliation', 'pacotes', busca] as const,
};

export function useSugestoesQuery(kind?: SuggestionKind) {
  return useQuery({
    queryKey: reconciliationKeys.sugestoes(kind),
    queryFn: async () => (
      await apiClient.get<ListEnvelope<Sugestao>>('/reconciliation/suggestions', {
        params: kind ? { kind } : undefined,
      })
    ).data,
  });
}

export function useCoberturaQuery() {
  return useQuery({
    queryKey: reconciliationKeys.cobertura(),
    queryFn: async () => (await apiClient.get<Cobertura>('/reconciliation/coverage')).data,
  });
}

export function useOciososQuery(dias = 30) {
  return useQuery({
    queryKey: reconciliationKeys.ociosos(dias),
    queryFn: async () => (
      await apiClient.get<{ total: number; rows: AtivoOcioso[] }>('/reconciliation/idle', { params: { dias } })
    ).data,
  });
}

export function useConfiguracaoDaDescobertaQuery() {
  return useQuery({
    queryKey: reconciliationKeys.configuracao(),
    queryFn: async () => (await apiClient.get<ConfiguracaoDaDescoberta>('/settings/discovery')).data,
  });
}

/** Tudo o que a aba Máquina mostra: specs, último contato, software e mudanças. */
export function useMaquinaDoAtivoQuery(assetId: string | null) {
  return useQuery({
    queryKey: reconciliationKeys.maquinaDoAtivo(assetId ?? ''),
    queryFn: async () => (await apiClient.get<MaquinaDoAtivo>(`/assets/${assetId}/machine`)).data,
    enabled: assetId != null,
  });
}

export function useConformidadeQuery(licenseId: string | null) {
  return useQuery({
    queryKey: reconciliationKeys.conformidade(licenseId ?? ''),
    queryFn: async () => (await apiClient.get<Conformidade>(`/licenses/${licenseId}/compliance`)).data,
    enabled: licenseId != null,
  });
}

/** Tudo que a resolução de uma sugestão pode ter mudado. */
function useInvalidarTudo() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: reconciliationKeys.all });
    void queryClient.invalidateQueries({ queryKey: assetKeys.all });
    void queryClient.invalidateQueries({ queryKey: endpointKeys.all });
  };
}

export interface AceiteExtra {
  locationId?: string;
  shift?: string;
}

export function useAceitarSugestao() {
  const invalidar = useInvalidarTudo();
  return useMutation({
    mutationFn: async ({ id, extra }: { id: string; extra?: AceiteExtra }) =>
      (await apiClient.post<Sugestao>(`/reconciliation/suggestions/${id}/accept`, extra ?? {})).data,
    onSuccess: invalidar,
  });
}

export function useRecusarSugestao() {
  const invalidar = useInvalidarTudo();
  return useMutation({
    mutationFn: async (id: string) =>
      (await apiClient.post<Sugestao>(`/reconciliation/suggestions/${id}/reject`)).data,
    onSuccess: invalidar,
  });
}

export function useTriarMaquina() {
  const invalidar = useInvalidarTudo();
  return useMutation({
    mutationFn: async ({ id, reviewState }: { id: string; reviewState: ReviewState }) =>
      (await apiClient.patch(`/endpoints/${id}/review`, { reviewState })).data,
    onSuccess: invalidar,
  });
}

export function useDesvincularMaquina() {
  const invalidar = useInvalidarTudo();
  return useMutation({
    mutationFn: async (endpointId: string) => (await apiClient.delete(`/endpoints/${endpointId}/link`)).data,
    onSuccess: invalidar,
  });
}

export function useSalvarConfiguracaoDaDescoberta() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (dados: Partial<ConfiguracaoDaDescoberta>) =>
      (await apiClient.put<ConfiguracaoDaDescoberta>('/settings/discovery', dados)).data,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: reconciliationKeys.all });
    },
  });
}

// ── A PONTE LICENÇA↔PACOTE E A CONFORMIDADE (Etapa G, D102) ─────────────────
//
// Os três hooks abaixo são o que faltava para a conformidade existir de verdade.
// O motor estava pronto desde a Etapa G — `LicenseSoftware`, o cruzamento por
// assento, as duas perguntas do relatório — e nenhuma tela tinha de onde tirar
// um `packageId`, então a ponte nunca recebia linha e `calcularConformidade`
// respondia `semVinculoDeSoftware: true` para sempre.

/**
 * O catálogo de software descoberto, com busca.
 *
 * `placeholderData` e não `enabled`: a lista abre com os mais instalados e vai
 * filtrando conforme se digita, sem piscar em branco entre as teclas. O catálogo
 * de uma frota real tem milhares de linhas e é o servidor que corta em 100.
 */
export function usePacotesDeSoftwareQuery(busca: string) {
  return useQuery({
    queryKey: reconciliationKeys.pacotes(busca),
    queryFn: async () => (
      await apiClient.get<{ total: number; rows: PacoteDoCatalogo[] }>('/software-packages', {
        params: busca ? { q: busca } : undefined,
      })
    ).data,
    placeholderData: (anterior) => anterior,
  });
}

/** Os pacotes JÁ ligados a esta licença — o que o formulário abre marcado. */
export function useSoftwareDaLicencaQuery(licenseId: string | null) {
  return useQuery({
    queryKey: reconciliationKeys.softwareDaLicenca(licenseId ?? ''),
    queryFn: async () => (
      await apiClient.get<{ total: number; rows: PacoteDoCatalogo[] }>(`/licenses/${licenseId}/software`)
    ).data,
    enabled: licenseId != null,
  });
}

/**
 * Define o CONJUNTO de pacotes de uma licença. O que não está na lista é
 * desligado — é por isso que a mutação recebe o conjunto e não um item.
 *
 * Invalida `licenseKeys` junto: mudar o que a licença cobre muda o relatório de
 * conformidade dela, e ele é lido na mesma janela.
 */
export function useDefinirSoftwareDaLicenca(licenseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (packageIds: string[]) =>
      (await apiClient.put(`/licenses/${licenseId}/software`, { packageIds })).data,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: reconciliationKeys.all });
      void queryClient.invalidateQueries({ queryKey: licenseKeys.all });
    },
  });
}
