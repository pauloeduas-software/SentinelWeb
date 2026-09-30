import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../core/api/apiClient';
import type {
  RelatorioDeAuditorias, RelatorioDeDepreciacao, RelatorioDeManutencoes, RelatorioDePrazos,
} from '../shared/lifecycle.types';

// OS QUATRO RELATÓRIOS (docs/FASE-8-PLANO-ITAM.md, Etapa D).
//
// Nenhuma mutação neste arquivo, e não é descuido: relatório é leitura agregada e
// NENHUM relatório escreve. O prefixo `['reports']` é invalidado pelas mutações de
// manutenção, auditoria e configuração — são elas que mudam o que estes números
// medem.

export const reportKeys = {
  all: ['reports'] as const,
  depreciacao: () => ['reports', 'depreciacao'] as const,
  prazos: () => ['reports', 'prazos'] as const,
  auditorias: () => ['reports', 'auditorias'] as const,
  manutencoes: () => ['reports', 'manutencoes'] as const,
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
