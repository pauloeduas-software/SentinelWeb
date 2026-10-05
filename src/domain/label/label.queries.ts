import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../core/api/apiClient';
import type { LayoutDeEtiqueta, LayoutNaResposta, MedidaDaEtiqueta } from '../shared/label.types';

// AS ETIQUETAS (docs/historico/fase-10-etiquetas-relatorios-importacao.md, Etapa G).
//
// O PREVIEW VEM COMO BLOB, e é por isso que ele é `useMutation` e não
// `useQuery`: a resposta é um PDF de alguns KB que precisa virar uma URL de
// objeto para o `<iframe>`. Guardá-lo no cache do TanStack Query manteria o
// binário na memória da aba a cada ajuste do formulário — e ninguém revalida um
// preview em segundo plano.
//
// E O LAYOUT VIAJA NO CORPO, não é lido do banco pelo servidor: o preview tem de
// desenhar o que está sendo EDITADO. Lido do banco, a tela só mostraria o efeito
// de um ajuste depois de salvá-lo — e o objetivo declarado é não gastar a folha
// descobrindo.

export const labelKeys = {
  all: ['labels'] as const,
  layout: () => ['labels', 'layout'] as const,
};

export function useLabelLayoutQuery() {
  return useQuery({
    queryKey: labelKeys.layout(),
    queryFn: async () => (await apiClient.get<LayoutNaResposta>('/labels/layout')).data,
  });
}

export function useSalvarLayout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (layout: LayoutDeEtiqueta) =>
      (await apiClient.put<{ layout: LayoutDeEtiqueta; medida: MedidaDaEtiqueta }>(
        '/labels/layout',
        layout,
      )).data,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: labelKeys.all }),
  });
}

/** A prévia: UMA página, o MESMO PDF da impressão. */
export function usePreviaDeEtiquetas() {
  return useMutation({
    mutationFn: async (pedido: { assetIds: string[]; layout: LayoutDeEtiqueta }) => {
      const resposta = await apiClient.post<Blob>('/labels/preview', pedido, {
        responseType: 'blob',
      });
      return URL.createObjectURL(resposta.data);
    },
  });
}

/**
 * A folha inteira, baixada.
 *
 * Não é `<a download>` como o CSV porque o corpo carrega a lista de ativos e o
 * layout — e um `<a>` só manda `GET`. O blob é criado, clicado e revogado: sem
 * o `revokeObjectURL`, cada impressão deixaria o PDF inteiro na memória da aba
 * até ela fechar.
 */
export function useBaixarFolha() {
  return useMutation({
    mutationFn: async (pedido: { assetIds: string[]; layout: LayoutDeEtiqueta }) => {
      const resposta = await apiClient.post<Blob>('/labels/sheet', pedido, {
        responseType: 'blob',
      });

      const url = URL.createObjectURL(resposta.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'etiquetas.pdf';
      link.click();
      URL.revokeObjectURL(url);
    },
  });
}

/**
 * Resolve as etiquetas bipadas em ativos — UMA chamada para a folha inteira.
 *
 * `useMutation` porque o gesto é "colei/bipei, resolve": não é dado que a tela
 * mostra e revalida, e a chave de cache seria a lista inteira de termos.
 */
export function useResolverEtiquetas() {
  return useMutation({
    mutationFn: async (termos: string[]) =>
      (await apiClient.post<{
        encontrados: { id: string; assetTag: string; name: string | null; serial: string | null }[];
        naoEncontrados: string[];
      }>('/assets/resolve-tags', { termos })).data,
  });
}
