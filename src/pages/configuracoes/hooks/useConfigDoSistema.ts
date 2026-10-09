import { useSaveSystemSettings } from '../../../domain/settings/settings.queries';
import type { ConfiguracaoDoSistema } from '../../../domain/shared/settings.types';
import { useSistema } from '../../hooks/useSistema';

// O estado da aba *Sistema*. Mesma divisão de todas as telas: o hook fala com
// as queries do domínio, o componente recebe dados e callbacks.
//
// A LEITURA É O MESMO `useSistema()` QUE O `Layout` USA — a query é
// compartilhada, então abrir esta aba não refaz a consulta que ele já fez.
export function useConfigDoSistema() {
  const { configuracao, carregando } = useSistema();
  const salvar = useSaveSystemSettings();

  return {
    configuracao,
    carregando,
    salvando: salvar.isPending,
    // O `apiClient` já traduziu o 422 do servidor em frase de gente.
    erro: salvar.error?.message ?? null,

    onSalvar: (dados: Partial<ConfiguracaoDoSistema>) => salvar.mutate(dados),
  };
}
