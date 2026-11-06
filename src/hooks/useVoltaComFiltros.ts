import { useLocation } from 'react-router-dom';

/**
 * O `state` de quem abre uma ficha: os filtros da lista vão junto, e a seta volta com eles.
 * `lista` é para quem abre a ficha de outra tela: Descobertas abre a do computador.
 */
export function comFiltros(parametros: URLSearchParams, lista?: string) {
  return { state: { filtros: parametros.toString(), lista } };
}

/** Para onde a seta da ficha leva: a lista, como ela estava (BB). */
export function useVoltaComFiltros(lista: string): string {
  const { state } = useLocation();
  const { filtros, lista: origem = lista } = (state ?? {}) as { filtros?: string; lista?: string };
  return filtros ? `${origem}?${filtros}` : origem;
}
