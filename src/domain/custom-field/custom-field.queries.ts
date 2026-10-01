import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../core/api/apiClient';
import { assetKeys } from '../asset/asset.queries';
import { catalogKeys } from '../catalog/catalog.queries';
import type {
  CampoDeColuna, CampoRevelado, ComposicaoDoConjunto, ComposicaoInput, ConjuntoResolvido,
} from '../shared/custom-field.types';

// As três rotas que a spec de catálogo não expressa, mais a de revelar.
//
// O CRUD plano dos dois cadastros (campo e conjunto) usa
// `catalog.queries.ts` — eles são spec de catálogo (D64), e um hook próprio
// aqui seria uma segunda forma de fazer o que aquele já faz.

export const customFieldKeys = {
  /** Os campos que viram coluna da listagem de ativos. */
  colunas: () => ['custom-fields', 'list-view'] as const,
  /** O conjunto resolvido de um modelo. */
  conjuntoDoModelo: (modelId: string) => ['custom-fields', 'fieldset', modelId] as const,
  /** A composição de um conjunto, na tela de administração. */
  composicao: (fieldsetId: string) => ['custom-fieldsets', fieldsetId, 'fields'] as const,
};

/**
 * Os campos marcados como coluna da listagem.
 *
 * `staleTime` alto: campo customizado é catálogo — muda quando um administrador
 * o edita, não a cada carregamento da tabela de ativos. Sem isto, a listagem
 * faria uma segunda requisição a cada 5 segundos junto com o polling da lista.
 */
export function useColunasCustomizadasQuery() {
  return useQuery({
    queryKey: customFieldKeys.colunas(),
    queryFn: async () => (await apiClient.get<CampoDeColuna[]>('/custom-fields/list-view')).data,
    staleTime: 60_000,
  });
}

/**
 * O conjunto de campos do MODELO escolhido (D58).
 *
 * `enabled` porque o formulário abre com o `<select>` de modelo vazio: sem ele, a
 * primeira consulta iria para `/assets/fieldset?modelId=` e voltaria 422.
 *
 * E a chave inclui o `modelId`: trocar o modelo no `<select>` tem que trocar os
 * campos desenhados, e é o cache por modelo que faz isso sem piscar quando o
 * usuário volta ao modelo anterior.
 */
export function useConjuntoDoModeloQuery(modelId: string | undefined) {
  return useQuery({
    queryKey: customFieldKeys.conjuntoDoModelo(modelId ?? ''),
    queryFn: async () =>
      (await apiClient.get<ConjuntoResolvido>('/assets/fieldset', { params: { modelId } })).data,
    enabled: modelId != null && modelId !== '',
    staleTime: 60_000,
  });
}

/** A composição de um conjunto, com o `quebrariam` de cada campo (D61). */
export function useComposicaoQuery(fieldsetId: string | null) {
  return useQuery({
    queryKey: customFieldKeys.composicao(fieldsetId ?? ''),
    queryFn: async () =>
      (await apiClient.get<ComposicaoDoConjunto>(`/custom-fieldsets/${fieldsetId}/fields`)).data,
    enabled: fieldsetId != null && fieldsetId !== '',
  });
}

/**
 * Grava a composição INTEIRA.
 *
 * Invalida três coisas, e cada uma por um motivo:
 *   - a composição, porque os `quebrariam` mudam depois de gravar;
 *   - `['catalog', 'custom-fieldsets']`, porque a tabela mostra quantos campos
 *     o conjunto tem;
 *   - `['custom-fields']`, porque o conjunto resolvido de todo modelo alcançado
 *     acabou de mudar — e é ele que o formulário de ativo desenha.
 */
export function useSalvarComposicao(fieldsetId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: ComposicaoInput) =>
      (await apiClient.put<ComposicaoDoConjunto>(`/custom-fieldsets/${fieldsetId}/fields`, data)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: customFieldKeys.composicao(fieldsetId) });
      queryClient.invalidateQueries({ queryKey: catalogKeys.tabela('custom-fieldsets') });
      queryClient.invalidateQueries({ queryKey: ['custom-fields'] });
    },
  });
}

/**
 * REVELAR um campo cifrado.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * MUTAÇÃO, e não `useQuery`, apesar de a rota ser um GET.
 *
 * A rota GRAVA `ActivityLog` a cada chamada: *quem viu este segredo* é o fato
 * auditável (D62). Como `useQuery`, o TanStack a chamaria por conta própria —
 * ao remontar a tela, ao voltar o foco da janela, ao reconectar a rede — e cada
 * uma dessas escreveria uma linha de auditoria que ninguém pediu.
 *
 * Como mutação, ela só acontece quando alguém clica. É o mesmo desenho da
 * revelação da chave de produto da F6.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export function useRevelarCampo(assetId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (slug: string) =>
      (await apiClient.get<CampoRevelado>(`/assets/${assetId}/custom-fields/${slug}/reveal`)).data,
    // A TRILHA GANHOU UMA LINHA `VIEW_FIELD`, e a aba Histórico precisa saber.
    //
    // Sem esta invalidação, a aba ficaria mostrando a linha do tempo de ANTES da
    // revelação até que outra coisa qualquer a atualizasse — e a tela estaria
    // negando, para quem está olhando, o registro que o servidor acabou de
    // gravar. É a mesma linha do `useRevealProductKey` da F6.
    //
    // `assetKeys.all` e não só o histórico: o prefixo `['assets']` alcança a
    // listagem, o detalhe e o histórico de uma vez, que é como todas as mutações
    // de ativo invalidam.
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: assetKeys.all }),
  });
}
