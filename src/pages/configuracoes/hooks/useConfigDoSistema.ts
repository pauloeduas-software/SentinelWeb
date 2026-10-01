import {
  urlDaMarca, useClearBranding, useSaveSystemSettings, useSetBranding,
} from '../../../domain/settings/settings.queries';
import type { ConfiguracaoDoSistema, MarcaVisual } from '../../../domain/shared/settings.types';
import { useSistema } from '../../hooks/useSistema';

// O estado da aba *Sistema*. Mesma divisão de todas as telas: o hook fala com
// as queries do domínio, o componente recebe dados e callbacks.
//
// A LEITURA É O MESMO `useSistema()` QUE O CABEÇALHO USA — a query é
// compartilhada, então abrir esta aba não refaz a consulta que o `Layout` já
// fez. E salvar invalida a chave: o nome e a logo no topo mudam junto, sem esta
// tela saber que o cabeçalho existe.
export function useConfigDoSistema() {
  const { configuracao, carregando } = useSistema();
  const salvar = useSaveSystemSettings();
  const subir = useSetBranding();
  const limpar = useClearBranding();

  return {
    configuracao,
    carregando,
    salvando: salvar.isPending || subir.isPending || limpar.isPending,
    // A primeira mensagem que houver. As três mutações escrevem o mesmo
    // registro, então duas falhas ao mesmo tempo não acontecem — e o
    // `apiClient` já traduziu o 422 do servidor em frase de gente.
    erro: salvar.error?.message ?? subir.error?.message ?? limpar.error?.message ?? null,
    urlDaLogo: configuracao?.logoPath ? urlDaMarca('logo') : null,
    urlDoFavicon: configuracao?.faviconPath ? urlDaMarca('favicon') : null,

    onSalvar: (dados: Partial<ConfiguracaoDoSistema>) => salvar.mutate(dados),
    onSubirMarca: (marca: MarcaVisual, arquivo: File) => subir.mutate({ marca, file: arquivo }),
    onLimparMarca: (marca: MarcaVisual) => limpar.mutate(marca),
  };
}
