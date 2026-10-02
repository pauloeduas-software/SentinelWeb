import { useMeusHoldingsQuery } from '../../../domain/assignment/assignment.queries';

// Estado da tela MEUS EQUIPAMENTOS (F11, Etapa I).
//
// Quase nada: uma consulta e os quatro baldes que ela devolve. O hook existe pela
// regra da arquitetura (página não fala HTTP) e para dar nome ao que a tela mostra
// — não porque haja lógica a esconder.
export function useMeusEquipamentos() {
  const { data, isPending, error } = useMeusHoldingsQuery();

  return {
    carregando: isPending,
    erro: error ? (error as Error).message : null,
    diretos: data?.diretos ?? [],
    porPosto: data?.porPosto ?? [],
    acessorios: data?.acessorios ?? [],
    assentos: data?.assentos ?? [],
    /** Nada em nome nenhum: a tela diz isso em vez de mostrar quatro listas vazias. */
    vazio: Boolean(data)
      && data!.diretos.length === 0
      && data!.porPosto.length === 0
      && data!.acessorios.length === 0
      && data!.assentos.length === 0,
  };
}
