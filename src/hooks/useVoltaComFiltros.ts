import { useLocation } from 'react-router-dom';

/** O caminho de volta, no `state` da navegação: no link colado ele não existe, e a seta vai para a lista. */
interface EstadoDaVolta {
  filtros?: string;
  lista?: string;
  /** O `state` da ficha que abriu esta: é o que a seta devolve a ela. */
  anterior?: unknown;
}

/** Para onde a seta leva, e o `state` que ela entrega ao chegar lá. */
export interface Volta {
  para: string;
  state?: unknown;
}

/** O `state` de quem abre uma ficha: os filtros da lista vão junto, e a seta volta com eles. */
export function comFiltros(parametros: URLSearchParams) {
  return { state: { filtros: parametros.toString() } };
}

/**
 * O `state` de uma ficha que abre outra: a seta de lá volta para cá, na mesma aba, e a
 * daqui continua sabendo de onde veio (BJ). Cada ficha aberta assim guarda a anterior dentro
 * do `state`, e a seta desfaz um nível de cada vez.
 */
export function useVoltaParaEstaFicha(): EstadoDaVolta {
  const { pathname, search, state } = useLocation();
  return { filtros: search.slice(1), lista: pathname, anterior: state };
}

/** Quem abriu a ficha: a seta diz para onde volta. `lista` é a da própria ficha. */
export function rotuloDaVolta(para: string, lista: string): string {
  if (para.startsWith('/agentes/')) return 'Máquina';
  if (para.startsWith('/agentes')) return 'Agentes';
  if (para.startsWith('/postos/')) return 'Posto';
  if (para.startsWith('/colaboradores/')) return 'Colaborador';
  if (para.startsWith('/computadores/')) return 'Computador';
  if (para.startsWith('/estoque/')) return 'Item';
  if (para.startsWith('/licencas/')) return 'Licença';
  return lista;
}

/** Para onde a seta da ficha leva: a lista, como ela estava (BB). */
export function useVoltaComFiltros(lista: string): Volta {
  const { state } = useLocation();
  const { filtros, lista: origem = lista, anterior } = (state ?? {}) as EstadoDaVolta;
  return { para: filtros ? `${origem}?${filtros}` : origem, state: anterior };
}
