import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../api/apiClient';
import { assetKeys } from './asset.queries';
import { workstationKeys } from './workstation.queries';
import type { WorkstationOccupant } from '../types/posse.types';

// QUEM OCUPA O POSTO — Camada 2 de docs/referencia/modelo-de-posse.md, a que o Snipe-IT não
// tem. É aqui que a Mesa 1 vira "Laura de manhã, Ana à tarde".
//
// `['occupancies']` é o prefixo, então invalidar depois de gravar alcança a ficha do
// posto e também a tela do colaborador.
const occupancyKeys = {
  all: ['occupancies'] as const,
  doPosto: (workstationId: string) => ['occupancies', 'workstation', workstationId] as const,
  daPessoa: (personId: string) => ['occupancies', 'person', personId] as const,
};

/** Corpo de `POST /api/workstations/:id/occupants`. */
export interface OccupantInput {
  personId: string;
  /** Texto livre: "Manhã", "Tarde", "12x36 A". Enum engessaria escala real. */
  shift?: string;
  notes?: string;
  /** Em branco, o servidor usa agora. */
  startedAt?: string;
}

export function useWorkstationOccupantsQuery(workstationId: string | null) {
  return useQuery({
    queryKey: occupancyKeys.doPosto(workstationId ?? ''),
    queryFn: async () =>
      (await apiClient.get<WorkstationOccupant[]>(`/workstations/${workstationId}/occupants`)).data,
    enabled: workstationId != null,
  });
}

/** Os postos que uma pessoa ocupa — a outra ponta da mesma tabela. */
export function usePersonOccupanciesQuery(personId: string | null) {
  return useQuery({
    queryKey: occupancyKeys.daPessoa(personId ?? ''),
    queryFn: async () =>
      (await apiClient.get<WorkstationOccupant[]>(`/people/${personId}/occupancies`)).data,
    enabled: personId != null,
  });
}

/**
 * Por que as mutações abaixo invalidam ATIVOS, e não só ocupações:
 *
 * a responsabilidade é derivada (Camada 3). Colocar alguém na Mesa 1 muda quem
 * responde por TODO ativo entregue à Mesa 1 sem que nenhum ativo tenha sido
 * tocado. Encerrar a última ocupação faz o caminho inverso. Invalidar só
 * `occupancies` deixaria a ficha do computador mentindo até o próximo refetch.
 *
 * E POSTOS pelo mesmo motivo, do outro lado: a linha da Mesa 1 em /postos mostra
 * quem responde e o selo "posto vago". Encerrar a última ocupação de
 * uma mesa que segura equipamento é exatamente o que ACENDE aquele selo — sem
 * esta invalidação, a tela que existe para mostrar o sinal seria a última a
 * saber dele.
 *
 * Devolve a promessa e roda também no erro, como `invalidarLicencaEPosse`: o botão só
 * destrava com a tela relida, e o 409 de quem viu a tela velha traz a tela nova.
 */
function invalidarPosseDerivada(queryClient: ReturnType<typeof useQueryClient>) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: occupancyKeys.all }),
    queryClient.invalidateQueries({ queryKey: assetKeys.all }),
    queryClient.invalidateQueries({ queryKey: workstationKeys.all }),
  ]);
}

export function useAddWorkstationOccupant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ workstationId, data }: { workstationId: string; data: OccupantInput }) =>
      apiClient.post(`/workstations/${workstationId}/occupants`, data),
    onSettled: () => invalidarPosseDerivada(queryClient),
  });
}

/**
 * CORRIGE O TURNO de uma ocupação aberta — "manha" para "manhã", "08h–14h" para
 * "08h–15h". A linha continua a mesma, com o mesmo início: encerrar e reabrir
 * fabricaria no histórico uma saída que não aconteceu.
 *
 * Invalida o mesmo que adicionar e encerrar: o turno não muda QUEM responde,
 * mas aparece junto do nome na ficha do ativo ("Laura (Manhã)"), na posse dele
 * e na lista de postos.
 */
export function useCorrigirTurno() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ workstationId, occupantId, shift }: { workstationId: string; occupantId: string; shift: string | null }) =>
      apiClient.patch(`/workstations/${workstationId}/occupants/${occupantId}`, { shift }),
    onSettled: () => invalidarPosseDerivada(queryClient),
  });
}

/**
 * ENCERRA a ocupação — não apaga a linha, apesar do verbo HTTP.
 *
 * O `DELETE` aqui é a operação do ponto de vista de quem usa ("tirar a Ana da
 * Mesa 1"); no banco ele preenche `endedAt`, e "quem respondia pela Mesa 1 em
 * março?" continua respondível.
 */
export function useEndWorkstationOccupancy() {
  const queryClient = useQueryClient();
  return useMutation({
    // `endedAt`: o dia em que a pessoa saiu, 'AAAA-MM-DD' (AM). Ausente é agora.
    mutationFn: ({ workstationId, occupantId, endedAt }: { workstationId: string; occupantId: string; endedAt?: string }) =>
      apiClient.delete(`/workstations/${workstationId}/occupants/${occupantId}`, { data: endedAt ? { endedAt } : {} }),
    onSettled: () => invalidarPosseDerivada(queryClient),
  });
}
