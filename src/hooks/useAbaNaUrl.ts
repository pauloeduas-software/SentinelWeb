import { useLocation, useSearchParams } from 'react-router-dom';

/**
 * A aba de uma tela mora na URL (`?aba=historico`, BB): o F5 não volta para a primeira,
 * e um link leva direto a ela. A primeira é o endereço limpo. `replace`: o voltar do
 * navegador sai da tela, em vez de desfazer aba por aba.
 */
export function useAbaNaUrl<T extends string>(abas: readonly T[]): [T, (aba: T) => void] {
  const [parametros, setParametros] = useSearchParams();
  // O `state` vai junto: a seta da ficha volta para a lista com os filtros dele.
  const { state } = useLocation();
  const aba = abas.find((item) => item === parametros.get('aba')) ?? abas[0];

  const trocar = (proxima: T) => setParametros(proxima === abas[0] ? {} : { aba: proxima }, { replace: true, state });

  return [aba, trocar];
}
