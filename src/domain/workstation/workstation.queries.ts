import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../core/api/apiClient';
import { catalogKeys } from '../catalog/catalog.queries';
import type { ListEnvelope } from '../shared/list.types';
import type { Posto, PostoDetalhe, PostoView } from '../shared/workstation.types';

// O POSTO DE TRABALHO — a Mesa 1, a bancada, o guichê.
//
// A chave inclui os parâmetros e o recorte: sem isso a visão "Vagos" seria
// servida do cache de "Todos". `['workstations']` continua sendo o prefixo,
// então invalidar alcança a lista E o detalhe aberto — o que importa porque
// colocar alguém num posto muda a linha dele na lista sem a lista ter sido
// tocada.
export const workstationKeys = {
  all: ['workstations'] as const,
  list: (params: PostoListParams) => ['workstations', 'list', params] as const,
  detalhe: (id: string) => ['workstations', 'detalhe', id] as const,
};

export interface PostoListParams {
  page?: number;
  perPage?: number;
  q?: string;
  view?: PostoView;
}

export function useWorkstationsQuery(params: PostoListParams) {
  return useQuery({
    queryKey: workstationKeys.list(params),
    queryFn: async () =>
      (await apiClient.get<ListEnvelope<Posto>>('/workstations', { params })).data,
    // Sem isto a tabela pisca em branco a cada troca de página, de recorte ou
    // tecla da busca.
    placeholderData: keepPreviousData,
  });
}

export function useWorkstationQuery(id: string | null) {
  return useQuery({
    queryKey: workstationKeys.detalhe(id ?? ''),
    queryFn: async () => (await apiClient.get<PostoDetalhe>(`/workstations/${id}`)).data,
    enabled: id != null,
  });
}

/** Corpo do cadastro de um posto. */
export interface NovoPostoInput {
  name: string;
  /** A sala ou o andar que contém a mesa. Em branco, o posto fica na raiz. */
  parentId?: string;
  notes?: string;
}

/**
 * Cria um posto — gravando em `/locations`, não numa rota própria.
 *
 * O posto É uma `Location` (docs/MODELO-POSSE.md, D15): uma rota de escrita
 * separada seria um segundo lugar para criar a mesma linha, e com ela um
 * segundo lugar para esquecer a guarda de ciclo da hierarquia e o
 * `ActivityLog`. O que esta mutação acrescenta é `isWorkstation: true` — a
 * marca que faz a mesa aparecer em /postos em vez de se perder no meio das
 * filiais.
 *
 * ENDEREÇO, CEP E TELEFONE NÃO SÃO ENVIADOS, e não é omissão: eles não querem
 * dizer nada numa mesa. Quem precisar deles numa localização usa o formulário
 * completo em Configurações.
 *
 * Invalida os DOIS caches porque a linha criada aparece em dois lugares: a
 * lista de postos e a aba Localizações do catálogo. Invalidar só um deixaria o
 * outro mentindo até o próximo refetch.
 */
export function useCreateWorkstation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: NovoPostoInput) =>
      apiClient.post('/locations', { ...data, isWorkstation: true }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: workstationKeys.all });
      void queryClient.invalidateQueries({ queryKey: catalogKeys.tabela('locations') });
    },
  });
}
