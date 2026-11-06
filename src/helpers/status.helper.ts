import type { Asset } from '../types/asset.types';

export type TipoDeStatus = Asset['status']['type'];

/**
 * O tom da marca de status, pelo TIPO e não pelo nome: o nome é texto livre do
 * cadastro, e o tipo é o que diz a situação (AY).
 */
export function tomDoStatus(tipo: TipoDeStatus): 'sucesso' | 'info' | 'aviso' | 'perigo' {
  const tons = { DEPLOYABLE: 'sucesso', IN_USE: 'info', PENDING: 'aviso', UNDEPLOYABLE: 'perigo' } as const;
  return tons[tipo];
}
