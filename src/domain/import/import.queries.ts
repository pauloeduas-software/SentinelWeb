import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../core/api/apiClient';
import { assetKeys } from '../asset/asset.queries';
import { userKeys } from '../user/user.queries';
import type { ListEnvelope, ListParams } from '../shared/list.types';
import type {
  AlvoDeImport, CamposDoAlvo, Importacao, LinhaDoImport, MapeamentoDeImport, SituacaoDaLinha,
} from '../shared/import.types';

// A IMPORTAÇÃO DE CSV (docs/FASE-10-PLANO-ITAM.md, Etapa D).
//
// DOIS PASSOS, DUAS MUTAÇÕES (D68). O upload SIMULA — ele não escreve nada fora
// de `imports`/`import_rows` —, e é por isso que `useSubirImportacao` não
// invalida a listagem de ativos nem a de pessoas. Quem invalida é o APPLY, e ele
// invalida tudo: uma carga de 500 linhas muda a frota, o quadro de pessoas, a
// posse e os contadores do cabeçalho.

export const importKeys = {
  all: ['imports'] as const,
  list: (params: ListParams) => ['imports', 'list', params] as const,
  item: (id: string) => ['imports', 'item', id] as const,
  linhas: (id: string, status: SituacaoDaLinha | 'TODAS', page: number) =>
    ['imports', 'linhas', id, status, page] as const,
  campos: (target: AlvoDeImport) => ['imports', 'campos', target] as const,
};

/** A URL do CSV-modelo. `<a download>`, como todo arquivo (ver `ExportarCsv`). */
export function urlDoModelo(target: AlvoDeImport): string {
  return `${apiClient.defaults.baseURL ?? ''}/imports/template?target=${target}`;
}

export function useCamposDoAlvoQuery(target: AlvoDeImport) {
  return useQuery({
    queryKey: importKeys.campos(target),
    queryFn: async () => (await apiClient.get<CamposDoAlvo>('/imports/fields', {
      params: { target },
    })).data,
    // A lista de campos muda com o DEPLOY, não com o uso.
    staleTime: Infinity,
  });
}

export function useImportsQuery(params: ListParams) {
  return useQuery({
    queryKey: importKeys.list(params),
    queryFn: async () => (await apiClient.get<ListEnvelope<Importacao>>('/imports', { params })).data,
  });
}

export function useImportQuery(id: string | null) {
  return useQuery({
    queryKey: importKeys.item(id ?? ''),
    queryFn: async () => (await apiClient.get<Importacao>(`/imports/${id}`)).data,
    enabled: id !== null,
  });
}

export function useLinhasDoImportQuery(
  id: string | null,
  status: SituacaoDaLinha | 'TODAS',
  page: number,
  perPage: number,
) {
  return useQuery({
    queryKey: importKeys.linhas(id ?? '', status, page),
    queryFn: async () => (await apiClient.get<ListEnvelope<LinhaDoImport>>(`/imports/${id}/rows`, {
      params: { page, perPage, ...(status === 'TODAS' ? {} : { status }) },
    })).data,
    enabled: id !== null,
  });
}

/**
 * PASSO 1: sobe o arquivo e roda a simulação.
 *
 * O `Content-Type` NÃO é definido à mão — o navegador precisa escrevê-lo com o
 * `boundary` que ele mesmo sorteia. E a ORDEM dos `append` importa: os campos
 * de texto vão ANTES do arquivo, porque o servidor lê o arquivo de dentro do
 * fluxo e o que vem depois dele ainda não chegou quando o handler roda.
 */
export function useSubirImportacao() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (entrada: { target: AlvoDeImport; mapeamento: MapeamentoDeImport; file: File }) => {
      const corpo = new FormData();
      corpo.append('target', entrada.target);
      corpo.append('mapping', JSON.stringify(entrada.mapeamento));
      corpo.append('file', entrada.file);

      return (await apiClient.post<Importacao>('/imports', corpo)).data;
    },
    // Só a lista de importações: a simulação não tocou em ativo nem em pessoa.
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: importKeys.all }),
  });
}

/** PASSO 2: aplica. É aqui que o inventário muda. */
export function useAplicarImportacao() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      (await apiClient.post<Importacao>(`/imports/${id}/apply`)).data,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: importKeys.all });
      // A carga mexeu no inventário, no quadro de pessoas e na posse — e os
      // contadores do cabeçalho saem de `/assets/stats`.
      void queryClient.invalidateQueries({ queryKey: assetKeys.all });
      void queryClient.invalidateQueries({ queryKey: userKeys.all });
    },
  });
}
