import { useSearchParams } from 'react-router-dom';
import { useAcoesDaMaquina } from './useAcoesDaMaquina';
import { useCoberturaQuery } from '../../../queries/reconciliation.queries';
import { useEndpointsQuery, type VistaDasMaquinas } from '../../../queries/endpoint.queries';
import { useListaLocalNaUrl } from '../../../hooks/usePaginaLocal';
import type { Endpoint } from '../../../types/endpoint.types';

// O ESTADO DA TELA AGENTES. A página é markup e mais nada
// (docs/referencia/arquitetura.md).

/**
 * As três vistas: a máquina que já é um computador, a que ainda não é, e a que
 * não dá sinal há 30 dias, com computador ou sem (DD). São o recorte do servidor
 * (`?vista=`), não um `filter` sobre a frota inteira, e não se sobrepõem. A
 * primeira é o endereço limpo, porque é o estado normal, como Ativos em
 * Computadores: com o vínculo pela série, Sem computador é a exceção (DC).
 */
const VISTAS = ['com', 'sem', 'sumidos'] as const satisfies readonly VistaDasMaquinas[];
export type VistaDosAgentes = typeof VISTAS[number];

/** Onde a busca procura: a máquina e o computador, e nunca id. */
function textoDaMaquina(maquina: Endpoint): string {
  return [
    maquina.hostname, maquina.osVersion, maquina.biosSerial, maquina.agentVersion,
    maquina.asset?.assetTag, maquina.asset?.name, maquina.asset?.serial,
  ].filter(Boolean).join(' ');
}

export function useAgentes() {
  const cobertura = useCoberturaQuery();
  const listas: Record<VistaDosAgentes, ReturnType<typeof useEndpointsQuery>> = {
    com: useEndpointsQuery('com'),
    sem: useEndpointsQuery('sem'),
    sumidos: useEndpointsQuery('sumidos'),
  };

  const acoes = useAcoesDaMaquina();

  const [parametros] = useSearchParams();
  const vista = VISTAS.find((item) => item === parametros.get('vista')) ?? 'com';
  const atual = listas[vista];
  const maquinas = useListaLocalNaUrl(atual.data ?? [], textoDaMaquina);

  return {
    vista,
    // Trocar de vista começa outra lista: a página volta para a primeira, e a busca fica.
    trocarVista: (proxima: VistaDosAgentes) => maquinas.filtrar('vista', proxima === 'com' ? undefined : proxima),
    // Sem resposta não há número: `undefined`, e a vista fica sem contagem.
    contagem: {
      com: listas.com.data?.length, sem: listas.sem.data?.length, sumidos: listas.sumidos.data?.length,
    } as Record<VistaDosAgentes, number | undefined>,

    maquinas,
    carregando: atual.isLoading,
    erro: atual.error?.message ?? null,

    cobertura: cobertura.data,
    erroDaCobertura: cobertura.error?.message ?? null,

    ...acoes,
  };
}
