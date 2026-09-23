import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../core/api/apiClient';
import { assetKeys } from '../asset/asset.queries';
import { assignmentKeys } from '../assignment/assignment.queries';
import { workstationKeys } from '../workstation/workstation.queries';
import type { LocationOccupant, OccupantView } from '../shared/posse.types';

// QUEM OCUPA O POSTO — Camada 2 de docs/MODELO-POSSE.md, a que o Snipe-IT não
// tem. É aqui que a Mesa 1 vira "Laura de manhã, Ana à tarde".
//
// A chave inclui o recorte (`current`/`all`): sem isso o histórico seria servido
// do cache dos atuais. `['occupancies']` continua sendo o prefixo, então
// invalidar depois de gravar alcança os dois e também a tela do colaborador.
export const occupancyKeys = {
  all: ['occupancies'] as const,
  doPosto: (locationId: string, view: OccupantView) =>
    ['occupancies', 'location', locationId, view] as const,
  doUsuario: (userId: string) => ['occupancies', 'user', userId] as const,
};

/** Corpo de `POST /api/locations/:id/occupants`. */
export interface OccupantInput {
  userId: string;
  /** Texto livre: "Manhã", "Tarde", "12x36 A". Enum engessaria escala real. */
  shift?: string;
  notes?: string;
  /** Em branco, o servidor usa agora. */
  startedAt?: string;
}

export function useLocationOccupantsQuery(locationId: string | null, view: OccupantView) {
  return useQuery({
    queryKey: occupancyKeys.doPosto(locationId ?? '', view),
    queryFn: async () =>
      (await apiClient.get<LocationOccupant[]>(`/locations/${locationId}/occupants`, {
        params: { view },
      })).data,
    enabled: locationId != null,
  });
}

/** Os postos que uma pessoa ocupa — a outra ponta da mesma tabela. */
export function useUserOccupanciesQuery(userId: string | null) {
  return useQuery({
    queryKey: occupancyKeys.doUsuario(userId ?? ''),
    queryFn: async () =>
      (await apiClient.get<LocationOccupant[]>(`/users/${userId}/occupancies`)).data,
    enabled: userId != null,
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

export function useAddLocationOccupant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ locationId, data }: { locationId: string; data: OccupantInput }) =>
      apiClient.post(`/locations/${locationId}/occupants`, data),
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
export function useEndLocationOccupancy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ locationId, occupantId }: { locationId: string; occupantId: string }) =>
      apiClient.delete(`/locations/${locationId}/occupants/${occupantId}`),
    onSuccess: () => invalidarPosseDerivada(queryClient),
  });
}
