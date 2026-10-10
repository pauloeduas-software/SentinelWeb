import { useMutation, useQuery } from '@tanstack/react-query';
import { apiClient } from '../../core/api/apiClient';
import type { AgentAction, Endpoint } from '../shared/endpoint.types';
import type { ListEnvelope } from '../shared/list.types';

// Chaves de cache do domínio, num lugar só: quem invalida não precisa adivinhar
// a string que a query usou.
export const endpointKeys = {
  all: ['endpoints'] as const,
};

// Ritmo do painel de telemetria. O agente manda amostra a cada poucos segundos;
// abaixo disso só geraria requisição sem dado novo.
const POLL_INTERVAL_MS = 5_000;

/**
 * Máquinas descobertas pelo agente, com a amostra de telemetria mais recente.
 * Revalida sozinha: não há `setInterval` nem limpeza de timer para manter.
 */
export function useEndpointsQuery() {
  return useQuery({
    queryKey: endpointKeys.all,
    // A API responde no envelope `{ total, rows }` em todas as listagens; a tela
    // de telemetria usa só as linhas, porque mostra a frota inteira em cards.
    queryFn: async () => (await apiClient.get<ListEnvelope<Endpoint>>('/endpoints')).data.rows,
    refetchInterval: POLL_INTERVAL_MS,
  });
}

/**
 * Comando de sistema na máquina. Não invalida cache: o efeito não é um dado
 * nosso — é a máquina desligando. O próximo ciclo de telemetria mostra.
 *
 * Pelo ID da máquina, e não pelo hwid: quem resolve a identidade de hardware é o
 * servidor (`send-command.usecase.ts`). O painel tinha o hwid porque carregava a
 * frota inteira; as telas que herdaram o comando conhecem o `endpointId` e mais
 * nada.
 */
export function useSendCommand() {
  return useMutation({
    mutationFn: ({ endpointId, action }: { endpointId: string; action: AgentAction }) =>
      apiClient.post(`/endpoints/${endpointId}/command`, { action }),
  });
}
