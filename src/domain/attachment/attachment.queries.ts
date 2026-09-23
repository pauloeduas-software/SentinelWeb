import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../core/api/apiClient';
import { assetKeys } from '../asset/asset.queries';
import type { Anexo, AlvoDeImagem } from '../shared/attachment.types';

// O TRANSPORTE DE ARQUIVO. A regra da camada continua: página não fala HTTP,
// hook não monta URL.
//
// A diferença para as outras queries é o corpo: `FormData`, não JSON. O
// `Content-Type` NÃO é definido à mão — o navegador precisa escrevê-lo junto
// com o `boundary` que ele mesmo sorteia, e um `'multipart/form-data'` fixo
// deixaria a requisição sem boundary e o servidor responderia 415.

export const attachmentKeys = {
  all: ['attachments'] as const,
  doAtivo: (assetId: string) => ['attachments', 'asset', assetId] as const,
};

/** A URL da imagem de um alvo. Por ID — nunca pelo caminho no disco (D84). */
export function urlDaImagem(alvo: AlvoDeImagem, id: string): string {
  return `${apiClient.defaults.baseURL ?? ''}/images/${alvo}/${id}`;
}

/** A URL de download de um anexo. Exige sessão, como tudo aqui. */
export function urlDoAnexo(id: string): string {
  return `${apiClient.defaults.baseURL ?? ''}/attachments/${id}/download`;
}

export function useAssetAttachmentsQuery(assetId: string | undefined) {
  return useQuery({
    queryKey: attachmentKeys.doAtivo(assetId ?? ''),
    queryFn: async () => (await apiClient.get<Anexo[]>(`/assets/${assetId}/attachments`)).data,
    enabled: assetId != null && assetId !== '',
  });
}

export function useUploadAttachment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ assetId, file }: { assetId: string; file: File }) => {
      const corpo = new FormData();
      corpo.append('file', file);
      return (await apiClient.post<Anexo>(`/assets/${assetId}/attachments`, corpo)).data;
    },
    onSuccess: (_anexo, { assetId }) => {
      void queryClient.invalidateQueries({ queryKey: attachmentKeys.doAtivo(assetId) });
      // O `ActivityLog` ganhou uma linha `ATTACH`: a aba Histórico muda junto.
      void queryClient.invalidateQueries({ queryKey: assetKeys.all });
    },
  });
}

export function useDeleteAttachment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; assetId: string }) => apiClient.delete(`/attachments/${id}`),
    onSuccess: (_resposta, { assetId }) => {
      void queryClient.invalidateQueries({ queryKey: attachmentKeys.doAtivo(assetId) });
      void queryClient.invalidateQueries({ queryKey: assetKeys.all });
    },
  });
}

export function useSetImage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ alvo, id, file }: { alvo: AlvoDeImagem; id: string; file: File }) => {
      const corpo = new FormData();
      corpo.append('file', file);
      return (await apiClient.put<{ id: string; imagePath: string | null }>(`/images/${alvo}/${id}`, corpo)).data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: assetKeys.all }),
  });
}

export function useClearImage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ alvo, id }: { alvo: AlvoDeImagem; id: string }) =>
      apiClient.delete(`/images/${alvo}/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: assetKeys.all }),
  });
}
