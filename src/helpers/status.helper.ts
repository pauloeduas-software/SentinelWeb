import type { Contagem } from '../components/CartoesDeContagem';
import type { Asset } from '../types/asset.types';
import type { StatusAtivoStats } from '../types/list.types';

export type TipoDeStatus = Asset['status']['type'];

/**
 * O tom da marca de status, pelo TIPO e não pelo nome: o nome é texto livre do
 * cadastro, e o tipo diz o que ele significa (AY).
 */
export function tomDoStatus(tipo: TipoDeStatus): 'sucesso' | 'info' | 'aviso' | 'perigo' {
  const tons = { DEPLOYABLE: 'sucesso', IN_USE: 'info', PENDING: 'aviso', UNDEPLOYABLE: 'perigo' } as const;
  return tons[tipo];
}

// OS CARTÕES TOTAL, ATIVOS E DESATIVADOS (BT): Estoque e Colaboradores, as listas cujo
// status é o `isActive`.

export type StatusAtivo = 'ativos' | 'desativados';

/** `?status=` da lista. O que não é recorte vale todos. */
export function statusAtivoDaUrl(valor: string | null): StatusAtivo | undefined {
  return valor === 'ativos' || valor === 'desativados' ? valor : undefined;
}

/** O `?isActive=` da API. Sem recorte, a chave nem vai. */
export function ativoDoStatus(status: StatusAtivo | undefined): boolean | undefined {
  return status === undefined ? undefined : status === 'ativos';
}

/** Os cartões da tela, na cor do selo da tabela. */
export function contagensDoStatusAtivo(stats: StatusAtivoStats | undefined): Contagem<StatusAtivo | undefined>[] {
  return [
    { valor: undefined, rotulo: 'Total', total: stats?.total },
    { valor: 'ativos', rotulo: 'Ativos', total: stats?.ativos, tom: 'sucesso' },
    { valor: 'desativados', rotulo: 'Desativados', total: stats?.desativados, tom: 'aviso' },
  ];
}
