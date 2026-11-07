import { useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { useDebouncedValue } from './useDebouncedValue';

/** A busca de "Com quem está" no endereço: `?quem=Mesa 1`. As outras fichas trazem por link. */
export const BUSCA_DA_FICHA = 'quem';

/**
 * A BUSCA E A PÁGINA DE "COM QUEM ESTÁ", na ficha do item e na da licença. Moram na ficha,
 * e não na aba, que desmonta ao trocar. O campo é lido da URL ao abrir, como na lista
 * (`useListaNaUrl`): controlado por ela, perderia letra de quem digita rápido.
 */
export function useBuscaDaFicha() {
  const [parametros, setParametros] = useSearchParams();
  // O `state` vai junto: a seta da ficha continua sabendo de onde veio.
  const { state } = useLocation();
  const [pagina, setPagina] = useState(1);
  const [busca, setBusca] = useState(parametros.get(BUSCA_DA_FICHA) ?? '');
  const buscaAdiada = useDebouncedValue(busca);

  const mudarBusca = (valor: string) => {
    setBusca(valor);
    setPagina(1);
    const atuais = new URLSearchParams(window.location.search);
    if (valor) atuais.set(BUSCA_DA_FICHA, valor);
    else atuais.delete(BUSCA_DA_FICHA);
    setParametros(atuais, { replace: true, state });
  };

  return { pagina, setPagina, busca, buscaAdiada, mudarBusca };
}
