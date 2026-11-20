import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../api/apiClient';
import { assetKeys } from './asset.queries';
import { catalogKeys } from './catalog.queries';
import { endpointKeys, POLL_INTERVAL_MS } from './endpoint.queries';
// Vincular E ENTREGAR muda a ficha do posto: a chave é do posto, quem pergunta
// importa (docs/referencia/arquitetura.md).
import { workstationKeys } from './workstation.queries';
import type { Cobertura, MaquinaDoAtivo } from '../types/reconciliation.types';

// A CONVERGÊNCIA RMM × ITAM (docs/decisoes/reconciliacao.md).
//
// `['reconciliation']` é o prefixo, então invalidar depois de vincular alcança o
// painel de cobertura — que muda a cada vínculo sem ninguém ter tocado nele.
//
// E o invalidate vai ALÉM do prefixo, de propósito: o vínculo máquina↔ativo
// muda as duas pontas. Quem não invalidasse `assets` e `endpoints` junto
// deixaria a aba Máquina do computador vazia até alguém recarregar a página.

const reconciliationKeys = {
  all: ['reconciliation'] as const,
  cobertura: () => ['reconciliation', 'cobertura'] as const,
  maquinaDoAtivo: (assetId: string) => ['reconciliation', 'maquina', assetId] as const,
};

export function useCoberturaQuery() {
  return useQuery({
    queryKey: reconciliationKeys.cobertura(),
    queryFn: async () => (await apiClient.get<Cobertura>('/reconciliation/coverage')).data,
    // No ritmo das vistas: Com agente é o número da vista Com computador (DI), e a
    // máquina que o handshake liga ou que vira sumida muda os dois.
    refetchInterval: POLL_INTERVAL_MS,
  });
}

/** Qual máquina está vinculada ao ativo: o painel da aba Máquina lê o resto. */
export function useMaquinaDoAtivoQuery(assetId: string | null) {
  return useQuery({
    queryKey: reconciliationKeys.maquinaDoAtivo(assetId ?? ''),
    queryFn: async () => (await apiClient.get<MaquinaDoAtivo>(`/assets/${assetId}/machine`)).data,
    enabled: assetId != null,
  });
}

/**
 * Tudo que vincular, desvincular e excluir podem ter mudado. Com as OPÇÕES de
 * computador: o seletor do vínculo só oferece o computador sem máquina
 * (`?maquina=sem`), e o `staleTime` de um minuto delas seguiria oferecendo o que
 * acabou de ganhar uma.
 */
function useInvalidarTudo() {
  const queryClient = useQueryClient();
  return (excluida?: string) => Promise.all([
    queryClient.invalidateQueries({ queryKey: reconciliationKeys.all }),
    queryClient.invalidateQueries({ queryKey: assetKeys.all }),
    queryClient.invalidateQueries({ queryKey: catalogKeys.tabela('assets') }),
    queryClient.invalidateQueries({
      queryKey: endpointKeys.all,
      // A máquina excluída não se relê: seria um 404 (`useExcluirMaquina`).
      predicate: ({ queryKey }) => !excluida || queryKey.join() !== endpointKeys.detalhe(excluida).join(),
    }),
  ]);
}

export function useDesvincularMaquina() {
  const invalidar = useInvalidarTudo();
  return useMutation({
    mutationFn: async (endpointId: string) => (await apiClient.delete(`/endpoints/${endpointId}/link`)).data,
    onSettled: () => invalidar(),
  });
}

/**
 * EXCLUIR A MÁQUINA — `DELETE /api/endpoints/:id` (DD). O servidor apaga a linha
 * e a credencial do agente, e fecha a conexão: ela só volta com o agente cadastrado de novo. Muda a
 * cobertura (os Sumidos), por isso invalida tudo.
 *
 * A consulta da máquina excluída não revalida: a ficha dela (DF) ainda está na tela
 * quando a resposta chega, e a releitura seria um 404. A ficha volta para a lista
 * sem esperar as invalidações: enquanto ela estiver montada, o `refetchInterval`
 * do detalhe ainda pode disparar.
 */
export function useExcluirMaquina() {
  const invalidar = useInvalidarTudo();
  return useMutation({
    mutationFn: async (endpointId: string) => (await apiClient.delete(`/endpoints/${endpointId}`)).data,
    onSettled: (_resposta, falha, endpointId) => {
      void invalidar(falha ? undefined : endpointId);
    },
  });
}

/**
 * ATUALIZAR AGORA — `POST /api/endpoints/:id/refresh` (DK). A rota volta quando a
 * máquina respondeu com o inventário e a telemetria, então a releitura já traz o
 * dado novo. Invalida o mesmo que o vínculo: o handshake novo pode ligar a máquina
 * pela série, como qualquer handshake.
 */
export function useAtualizarMaquina() {
  const invalidar = useInvalidarTudo();
  return useMutation({
    mutationFn: async (endpointId: string) => (await apiClient.post(`/endpoints/${endpointId}/refresh`, {})).data,
    onSettled: () => invalidar(),
  });
}

/**
 * VINCULAR À MÃO — `POST /api/endpoints/:id/link`.
 *
 * A máquina que a série não ligou sozinha (série da placa, nome que não bate,
 * computador ainda sem série) se vincula aqui. É a afirmação "esta máquina é
 * aquele patrimônio", dita por gente, e ela religa o vínculo automático (DC).
 */
export function useVincularMaquina() {
  const invalidar = useInvalidarTudo();
  return useMutation({
    mutationFn: async ({ endpointId, assetId }: { endpointId: string; assetId: string }) =>
      (await apiClient.post(`/endpoints/${endpointId}/link`, { assetId })).data,
    onSettled: () => invalidar(),
  });
}

/**
 * VINCULAR E ENTREGAR AO POSTO — `POST /api/endpoints/:id/link-and-checkout`.
 *
 * O cadastro do computador novo de ponta a ponta. Invalida também o posto,
 * porque a entrega muda a ficha dele e as opções de posto sem computador; e
 * invalida NO ERRO também: a rota encadeia duas operações e o vínculo pode ter
 * ficado quando a entrega falha — a resposta diz isso, e a lista precisa refletir.
 */
export function useVincularEEntregar() {
  const queryClient = useQueryClient();
  const invalidar = useInvalidarTudo();
  const invalidarComPosto = () => Promise.all([
    invalidar(),
    queryClient.invalidateQueries({ queryKey: workstationKeys.all }),
    queryClient.invalidateQueries({ queryKey: catalogKeys.tabela('workstations') }),
  ]);
  return useMutation({
    mutationFn: async ({ endpointId, assetId, targetWorkstationId }: {
      endpointId: string; assetId: string; targetWorkstationId: string;
    }) => (await apiClient.post(`/endpoints/${endpointId}/link-and-checkout`, { assetId, targetWorkstationId })).data,
    onSettled: invalidarComPosto,
  });
}
