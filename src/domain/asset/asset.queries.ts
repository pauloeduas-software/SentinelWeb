import { useMutation, useQuery } from '@tanstack/react-query';
import { apiClient } from '../../core/api/apiClient';
import type { AgentAction, Asset } from '../shared/asset.types';
import type { ListEnvelope } from '../shared/list.types';

// Chaves de cache do domínio, num lugar só: quem invalida não precisa adivinhar
// a string que a query usou.
export const assetKeys = {
  all: ['assets'] as const,
};

// Ritmo do painel de telemetria. O agente manda amostra a cada poucos segundos;
// abaixo disso só geraria requisição sem dado novo.
const POLL_INTERVAL_MS = 5_000;

/**
 * Máquinas descobertas pelo agente, com a amostra de telemetria mais recente.
 * Revalida sozinha: não há `setInterval` nem limpeza de timer para manter.
 */
export function useAssetsQuery() {
  return useQuery({
    queryKey: assetKeys.all,
    // A API responde no envelope `{ total, rows }` em todas as listagens; a tela
    // de telemetria usa só as linhas, porque mostra a frota inteira em cards.
    queryFn: async () => (await apiClient.get<ListEnvelope<Asset>>('/assets')).data.rows,
    refetchInterval: POLL_INTERVAL_MS,
  });
}

/**
 * Comando de sistema na máquina. Não invalida cache: o efeito não é um dado
 * nosso — é a máquina desligando. O próximo ciclo de telemetria mostra.
 */
export function useSendCommand() {
  return useMutation({
    mutationFn: ({ hwid, action }: { hwid: string; action: AgentAction }) =>
      apiClient.post(`/assets/${hwid}/command`, { action }),
  });
}
