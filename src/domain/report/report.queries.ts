import { useMutation, useQuery } from '@tanstack/react-query';
import { apiClient } from '../../core/api/apiClient';
import type {
  CamposDoBuilder, RelatorioDeAuditorias, RelatorioDeDepreciacao, RelatorioDeManutencoes,
  RelatorioDePrazos, RelatorioDeResponsabilidade, RespostaDoBuilder,
} from '../shared/lifecycle.types';

// OS RELATÓRIOS — quatro da F8 (docs/historico/fase-08-ciclo-de-vida.md, Etapa D) e dois da
// F10 (Etapa F), na MESMA moldura: o plano manda acrescentar aba, não abrir uma
// segunda tela de relatórios.
//
// NENHUM RELATÓRIO ESCREVE. O prefixo `['reports']` é invalidado pelas mutações
// de manutenção, auditoria e configuração — são elas que mudam o que estes
// números medem.
//
// A única `useMutation` daqui é o BUILDER, e ela também só lê: a rota é `POST`
// porque a lista de colunas é um array. O porquê está escrito nela.

export const reportKeys = {
  all: ['reports'] as const,
  depreciacao: () => ['reports', 'depreciacao'] as const,
  prazos: () => ['reports', 'prazos'] as const,
  auditorias: () => ['reports', 'auditorias'] as const,
  manutencoes: () => ['reports', 'manutencoes'] as const,
  responsabilidade: () => ['reports', 'responsabilidade'] as const,
  builderFields: () => ['reports', 'builder', 'fields'] as const,
};

/**
 * `enabled` em todas: a página tem quatro abas e só uma está visível.
 *
 * Sem isso, abrir `/relatorios` dispararia os quatro de uma vez — e o de
 * depreciação varre a frota inteira treze vezes (o valor atual mais os doze pontos
 * da curva). Três dessas varreduras seriam para abas que ninguém abriu.
 */
export function useDepreciationReportQuery(ativa: boolean) {
  return useQuery({
    queryKey: reportKeys.depreciacao(),
    queryFn: async () =>
      (await apiClient.get<RelatorioDeDepreciacao>('/reports/depreciacao')).data,
    enabled: ativa,
  });
}

export function useDeadlineReportQuery(ativa: boolean) {
  return useQuery({
    queryKey: reportKeys.prazos(),
    queryFn: async () => (await apiClient.get<RelatorioDePrazos>('/reports/prazos')).data,
    enabled: ativa,
  });
}

export function useAuditReportQuery(ativa: boolean) {
  return useQuery({
    queryKey: reportKeys.auditorias(),
    queryFn: async () =>
      (await apiClient.get<RelatorioDeAuditorias>('/reports/auditorias')).data,
    enabled: ativa,
  });
}

export function useMaintenanceReportQuery(ativa: boolean) {
  return useQuery({
    queryKey: reportKeys.manutencoes(),
    queryFn: async () =>
      (await apiClient.get<RelatorioDeManutencoes>('/reports/manutencoes')).data,
    enabled: ativa,
  });
}

// ── A CAMADA 3 AGREGADA (F10, Etapa F) ──────────────────────────────────────

export function useResponsabilidadeQuery(ativa: boolean) {
  return useQuery({
    queryKey: reportKeys.responsabilidade(),
    queryFn: async () =>
      (await apiClient.get<RelatorioDeResponsabilidade>('/reports/responsabilidade')).data,
    enabled: ativa,
  });
}

export function useBuilderFieldsQuery(ativa: boolean) {
  return useQuery({
    queryKey: reportKeys.builderFields(),
    queryFn: async () => (await apiClient.get<CamposDoBuilder>('/reports/builder/fields')).data,
    enabled: ativa,
    // A lista de colunas muda com o DEPLOY, não com o uso.
    staleTime: Infinity,
  });
}

/**
 * O BUILDER É `useMutation`, APESAR DE SÓ LER.
 *
 * Não é descuido nem desvio do "nenhuma mutação neste arquivo" escrito lá
 * acima: a rota é `POST` porque a lista de colunas é um array (não cabe numa
 * query string sem ambiguidade), e o TanStack Query não dispara `useQuery`
 * sobre `POST` sem que a chave carregue o corpo inteiro — o que faria cada
 * clique no seletor de colunas virar uma entrada nova no cache.
 *
 * Aqui o gesto é um CLIQUE em "gerar", com resultado que ninguém revalida em
 * segundo plano. É o mesmo desenho da revelação de chave de licença (F6): `POST`
 * de leitura, tratado como ação.
 */
export function useGerarRelatorio() {
  return useMutation({
    mutationFn: async (pedido: { columns: string[]; agruparPor?: string; limit?: number }) =>
      (await apiClient.post<RespostaDoBuilder>('/reports/custom', pedido)).data,
  });
}
