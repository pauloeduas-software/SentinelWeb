import { useMutation, useQuery } from '@tanstack/react-query';
import { apiClient } from '../../core/api/apiClient';
import type { AgentAction, Endpoint, EndpointComTelemetria } from '../shared/endpoint.types';
import type { ListEnvelope } from '../shared/list.types';

// Chaves de cache do domínio, num lugar só: quem invalida não precisa adivinhar
// a string que a query usou.
export const endpointKeys = {
  all: ['endpoints'] as const,
  lista: (vinculo: Vinculo | undefined) => ['endpoints', 'lista', vinculo ?? 'todas'] as const,
  detalhe: (id: string) => ['endpoints', 'detalhe', id] as const,
};

/** O recorte de `GET /api/endpoints?vinculo=`: `com` ativo, ou `sem`. */
type Vinculo = 'com' | 'sem';

// Ritmo da revalidação. O agente manda amostra a cada poucos segundos; abaixo
// disso só geraria requisição sem dado novo.
const POLL_INTERVAL_MS = 5_000;

/**
 * Máquinas descobertas pelo agente — sem telemetria: a amostra de UMA máquina
 * vem por `useEndpointQuery`.
 * Revalida sozinha: não há `setInterval` nem limpeza de timer para manter.
 *
 * Quem a consome é `/descobertas`, nas DUAS listas — as máquinas sem vínculo e
 * as vinculadas —, e o recorte é do SERVIDOR (`?vinculo=`), não um `filter` em
 * memória sobre a frota inteira: o filtro existia desde a F7 e a tela nunca o
 * usou. A tela que mostrava a frota em cards saiu, e com ela o único leitor que
 * precisava da amostra de TODAS — por isso a telemetria de uma máquina tem
 * consulta própria abaixo.
 */
export function useEndpointsQuery(vinculo?: Vinculo) {
  return useQuery({
    queryKey: endpointKeys.lista(vinculo),
    // A API responde no envelope `{ total, rows }` em todas as listagens;
    // `/descobertas` usa só as linhas.
    queryFn: async () => (
      await apiClient.get<ListEnvelope<Endpoint>>('/endpoints', { params: vinculo ? { vinculo } : {} })
    ).data.rows,
    refetchInterval: POLL_INTERVAL_MS,
  });
}

/**
 * UMA máquina, com a amostra mais recente — a ficha do ativo (aba Máquina) e a
 * do posto.
 *
 * Revalida no mesmo ritmo do painel antigo. A diferença é o tamanho da resposta:
 * ali eram as 500 linhas da frota a cada ciclo para desenhar os cards; aqui é a
 * máquina que está na tela.
 *
 * `enabled` porque ativo sem máquina vinculada é o caso comum — monitor, cadeira
 * e cabo nunca terão agente —, e `null` ali não pode virar `/endpoints/null`.
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
