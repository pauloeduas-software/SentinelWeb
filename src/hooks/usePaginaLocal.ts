import { useState } from 'react';
import { useBuscaDaFicha } from './useBuscaDaFicha';
import { POR_PAGINA, useListaNaUrl } from './useListaNaUrl';

/** A linha que saiu da lista pode ter levado a última página junto. */
function fatiar<T>(linhas: readonly T[], page: number) {
  const ultima = Math.max(1, Math.ceil(linhas.length / POR_PAGINA));
  const pagina = Math.min(page, ultima);
  return { page: pagina, visiveis: linhas.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA) };
}

function filtrar<T>(linhas: readonly T[], busca: string, textoDaLinha: (linha: T) => string) {
  const termo = busca.trim().toLowerCase();
  return termo ? linhas.filter((linha) => textoDaLinha(linha).toLowerCase().includes(termo)) : linhas;
}

/** A aba de ficha, que chega inteira: a página fica aqui, porque cada aba tem a sua. */
export function usePaginaLocal<T>(linhas: readonly T[]) {
  const [page, setPage] = useState(1);
  return { ...fatiar(linhas, page), setPage, total: linhas.length };
}

/**
 * A lista que chega inteira do servidor (Descobertas): filtra aqui, com a busca e a
 * página na URL, como toda lista (BB). `textoDaLinha` diz onde a busca procura.
 */
export function useListaLocalNaUrl<T>(linhas: readonly T[], textoDaLinha: (linha: T) => string) {
  const {
    search, changeSearch, page, perPage, setPage, parametros,
  } = useListaNaUrl();

  const achadas = filtrar(linhas, search, textoDaLinha);

  return { search, changeSearch, perPage, setPage, parametros, total: achadas.length, ...fatiar(achadas, page) };
}

/**
 * A aba Responsáveis que chega inteira (a do computador e a do posto): a busca é a do
 * `useBuscaDaFicha`, como em Estoque e Licenças, e a lista se filtra aqui.
 */
export function useBuscaLocalDaFicha<T>(linhas: readonly T[], textoDaLinha: (linha: T) => string) {
  const {
    pagina, setPagina, busca, buscaAdiada, mudarBusca,
  } = useBuscaDaFicha();

  const achadas = filtrar(linhas, buscaAdiada, textoDaLinha);

  return { busca, buscaAdiada, mudarBusca, setPage: setPagina, total: achadas.length, ...fatiar(achadas, pagina) };
}
