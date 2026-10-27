import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../core/api/apiClient';
import type { EventoDaPessoa, PessoaDaFicha } from '../shared/person.types';
import type { ListEnvelope } from '../shared/list.types';

// A FICHA DO COLABORADOR — só leitura. O cadastro (listar, criar, editar,
// desativar, excluir) é a página Colaboradores, pelo catálogo
// genérico (`catalog.queries.ts`, slug `people`).
export const personKeys = {
  all: ['people'] as const,
  um: (id: string) => ['people', 'detail', id] as const,
  // Pendurada no mesmo prefixo da ficha, como no ativo: invalidar `['people']`
  // recarrega as duas juntas, sem a mutação precisar saber que telas estão
  // abertas.
  history: (id: string) => ['people', 'history', id] as const,
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
export function usePersonHistoryQuery(id: string | null) {
  return useQuery({
    queryKey: personKeys.history(id ?? ''),
    queryFn: async () =>
      (await apiClient.get<ListEnvelope<EventoDaPessoa>>(`/people/${id}/history`)).data,
    enabled: id != null,
  });
}
