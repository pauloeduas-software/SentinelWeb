import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ParamsDoHistorico } from './asset.queries';
import { apiClient } from '../api/apiClient';
import type { EventoDaPessoa, PessoaDaFicha } from '../types/person.types';
import type { ListEnvelope } from '../types/list.types';

// A FICHA DO COLABORADOR. As escritas (criar, editar, desativar, excluir,
// restaurar) são as do catálogo genérico (`catalog.queries.ts`, slug `people`),
// da lista e do card da ficha (CD).
export const personKeys = {
  all: ['people'] as const,
  um: (id: string) => ['people', 'detail', id] as const,
  // Pendurada no mesmo prefixo da ficha, como no ativo: invalidar `['people']`
  // recarrega as duas juntas, sem a mutação precisar saber que telas estão
  // abertas.
  history: (id: string, params: ParamsDoHistorico) => ['people', 'history', id, params] as const,
};

/**
 * UM colaborador — a ficha.
 *
 * Chave própria e não um `find` na lista em cache: quem abre a ficha direto,
 * ou recarrega a página, não tem lista nenhuma carregada. O `enabled` segura a
 * consulta enquanto o id não existe.
 */
export function usePersonQuery(id: string | null) {
  return useQuery({
    queryKey: personKeys.um(id ?? ''),
    queryFn: async () => (await apiClient.get<PessoaDaFicha>(`/people/${id}`)).data,
    enabled: id != null,
  });
}

/**
 * O Histórico da pessoa: posses diretas + ocupações de posto + licenças
 * entregues a ela, do mais recente para o mais antigo.
 */
export function usePersonHistoryQuery(id: string | null, params: ParamsDoHistorico) {
  return useQuery({
    queryKey: personKeys.history(id ?? '', params),
    queryFn: async () =>
      (await apiClient.get<ListEnvelope<EventoDaPessoa>>(`/people/${id}/history`, { params })).data,
    enabled: id != null,
    placeholderData: keepPreviousData,
  });
}

/**
 * Relê a ficha depois de uma escrita pelo catálogo: as mutações de lá recarregam a
 * tabela, e a ficha mora em outra chave.
 */
export function useRecarregarColaborador() {
  const queryClient = useQueryClient();
  return () => void queryClient.invalidateQueries({ queryKey: personKeys.all });
}
