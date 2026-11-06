import { useState } from 'react';
import { POR_PAGINA, useListaNaUrl } from './useListaNaUrl';

/** A linha que saiu da lista pode ter levado a última página junto. */
function fatiar<T>(linhas: readonly T[], page: number) {
  const ultima = Math.max(1, Math.ceil(linhas.length / POR_PAGINA));
  const pagina = Math.min(page, ultima);
  return { page: pagina, visiveis: linhas.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA) };
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

  const termo = search.trim().toLowerCase();
  const achadas = termo ? linhas.filter((linha) => textoDaLinha(linha).toLowerCase().includes(termo)) : linhas;

  return { search, changeSearch, perPage, setPage, parametros, total: achadas.length, ...fatiar(achadas, page) };
}
