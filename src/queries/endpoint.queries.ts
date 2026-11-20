import { useMutation, useQuery } from '@tanstack/react-query';
import { apiClient } from '../api/apiClient';
import type { AgentAction, Endpoint, EndpointComTelemetria } from '../types/endpoint.types';
import type { ListEnvelope } from '../types/list.types';

// Chaves de cache do domínio, num lugar só: quem invalida não precisa adivinhar
// a string que a query usou.
export const endpointKeys = {
  all: ['endpoints'] as const,
  lista: (vista: VistaDasMaquinas | undefined) => ['endpoints', 'lista', vista ?? 'todas'] as const,
  detalhe: (id: string) => ['endpoints', 'detalhe', id] as const,
};

/** O recorte de `GET /api/endpoints?vista=`: com computador, sem, ou sumida (DD). */
export type VistaDasMaquinas = 'com' | 'sem' | 'sumidos';

// Ritmo da revalidação (DA). O que muda mais depressa é o último contato, a cada
// Ping do agente (30 a 60 s); a telemetria chega de hora em hora, e o Desconectado
// vem na hora quando a conexão fecha, e em uns 3 minutos quando ela some calada. Abaixo disso, a requisição volta com o mesmo dado.
export const POLL_INTERVAL_MS = 30_000;

/**
 * As máquinas com o agente — sem telemetria: a amostra de UMA máquina
 * vem por `useEndpointQuery`.
 * Revalida sozinha: não há `setInterval` nem limpeza de timer para manter.
 *
 * Quem a consome é `/agentes`, com as vistas Com computador, Sem computador e
 * Sumidos, e o recorte é do SERVIDOR (`?vista=`), não um `filter` em memória
 * sobre a frota inteira. A telemetria de uma máquina tem consulta própria abaixo.
 */
export function useEndpointsQuery(vista?: VistaDasMaquinas) {
  return useQuery({
    queryKey: endpointKeys.lista(vista),
    // A API responde no envelope `{ total, rows }` em todas as listagens;
    // `/agentes` usa só as linhas.
    queryFn: async () => (
      await apiClient.get<ListEnvelope<Endpoint>>('/endpoints', { params: vista ? { vista } : {} })
    ).data.rows,
    refetchInterval: POLL_INTERVAL_MS,
  });
}

/**
 * UMA máquina, com a amostra mais recente — a ficha da máquina, a do computador (aba
 * Máquina) e a do posto.
 *
 * Revalida no mesmo ritmo do painel antigo. A diferença é o tamanho da resposta:
 * ali eram as 500 linhas da frota a cada ciclo para desenhar os cards; aqui é a
 * máquina que está na tela.
 *
 * `enabled` porque ativo sem máquina vinculada é comum — nem todo computador
 * tem agente —, e `null` ali não pode virar `/endpoints/null`.
 */
export function useEndpointQuery(id: string | null) {
  return useQuery({
    queryKey: endpointKeys.detalhe(id ?? ''),
    queryFn: async () => (await apiClient.get<EndpointComTelemetria>(`/endpoints/${id}`)).data,
    enabled: id != null,
    refetchInterval: POLL_INTERVAL_MS,
  });
}

/**
 * Comando de sistema na máquina. Não invalida cache: o efeito não é um dado
 * nosso — é a máquina desligando. Quem mostra é o status: a desligada ou
 * reiniciada vira Desconectado na hora, e a suspensa, em uns 3 minutos.
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
