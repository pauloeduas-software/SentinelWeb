import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../core/api/apiClient';
import { assetKeys } from '../asset/asset.queries';
import { assignmentKeys } from '../assignment/assignment.queries';
import { workstationKeys } from '../workstation/workstation.queries';
import type { WorkstationOccupant, OccupantView } from '../shared/posse.types';

// QUEM OCUPA O POSTO — Camada 2 de docs/referencia/modelo-de-posse.md, a que o Snipe-IT não
// tem. É aqui que a Mesa 1 vira "Laura de manhã, Ana à tarde".
//
// A chave inclui o recorte (`current`/`all`): sem isso o histórico seria servido
// do cache dos atuais. `['occupancies']` continua sendo o prefixo, então
// invalidar depois de gravar alcança os dois e também a tela do colaborador.
const occupancyKeys = {
  all: ['occupancies'] as const,
  doPosto: (workstationId: string, view: OccupantView) =>
    ['occupancies', 'workstation', workstationId, view] as const,
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

export function useWorkstationOccupantsQuery(workstationId: string | null, view: OccupantView) {
  return useQuery({
    queryKey: occupancyKeys.doPosto(workstationId ?? '', view),
    queryFn: async () =>
      (await apiClient.get<WorkstationOccupant[]>(`/workstations/${workstationId}/occupants`, {
        params: { view },
      })).data,
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
 * Por que as duas mutações abaixo invalidam ATIVOS e POSSES, e não só ocupações:
 *
 * a responsabilidade é derivada (Camada 3). Colocar alguém na Mesa 1 muda quem
 * responde por TODO ativo entregue à Mesa 1 — e tira o `postoVago` da coluna
 * Responsável sem que nenhum ativo tenha sido tocado. Encerrar a última ocupação
 * faz o caminho inverso. Invalidar só `occupancies` deixaria a listagem mentindo
 * até o próximo refetch.
 *
 * E POSTOS pelo mesmo motivo, do outro lado: a linha da Mesa 1 em /postos mostra
 * quem está em cada turno e o selo "posto vago". Encerrar a última ocupação de
 * uma mesa que segura equipamento é exatamente o que ACENDE aquele selo — sem
 * esta invalidação, a tela que existe para mostrar o sinal seria a última a
 * saber dele.
 */
function invalidarPosseDerivada(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: occupancyKeys.all });
  void queryClient.invalidateQueries({ queryKey: assignmentKeys.all });
  void queryClient.invalidateQueries({ queryKey: assetKeys.all });
  void queryClient.invalidateQueries({ queryKey: workstationKeys.all });
}

export function useAddWorkstationOccupant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ workstationId, data }: { workstationId: string; data: OccupantInput }) =>
      apiClient.post(`/workstations/${workstationId}/occupants`, data),
    onSuccess: () => invalidarPosseDerivada(queryClient),
  });
}

/**
 * CORRIGE O TURNO de uma ocupação aberta — "manha" para "manhã", "08h–14h" para
 * "08h–15h". A linha continua a mesma, com o mesmo início: encerrar e reabrir
 * fabricaria no histórico uma saída que não aconteceu.
 *
 * Invalida o mesmo que adicionar e encerrar: o turno não muda QUEM responde,
 * mas aparece junto do nome na coluna Responsável dos ativos ("Laura (Manhã)"),
 * na posse do ativo e na lista de postos.
 */
export function useCorrigirTurno() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ workstationId, occupantId, shift }: { workstationId: string; occupantId: string; shift: string | null }) =>
      apiClient.patch(`/workstations/${workstationId}/occupants/${occupantId}`, { shift }),
    onSuccess: () => invalidarPosseDerivada(queryClient),
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
    mutationFn: ({ workstationId, occupantId }: { workstationId: string; occupantId: string }) =>
      apiClient.delete(`/workstations/${workstationId}/occupants/${occupantId}`),
    onSuccess: () => invalidarPosseDerivada(queryClient),
  });
}
