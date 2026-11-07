import type { Contagem } from '../../../components/CartoesDeContagem';
import type { AssetStats } from '../../../types/asset.types';
import { tomDoStatus, type TipoDeStatus } from '../../../helpers/status.helper';

const TIPOS: readonly TipoDeStatus[] = ['IN_USE', 'DEPLOYABLE', 'UNDEPLOYABLE', 'PENDING'];

/** `?status=` da lista. O que não é tipo vale todos: o servidor recusaria com 422. */
export function tipoDaUrl(valor: string | null): TipoDeStatus | undefined {
  return TIPOS.find((tipo) => tipo === valor);
}

/**
 * Os cartões da tela: o Total e um por TIPO de status, e não por status (BT). O status é
 * cadastro livre, e "Aguardando" soma em Pendente em vez de virar mais um cartão.
 */
export function contagensDosComputadores(stats: AssetStats | undefined): Contagem<TipoDeStatus | undefined>[] {
  return [
    { valor: undefined, rotulo: 'Total', total: stats?.total },
    { valor: 'IN_USE', rotulo: 'Em uso', total: stats?.byType.IN_USE, tom: tomDoStatus('IN_USE') },
    { valor: 'DEPLOYABLE', rotulo: 'Disponível', total: stats?.byType.DEPLOYABLE, tom: tomDoStatus('DEPLOYABLE') },
    { valor: 'UNDEPLOYABLE', rotulo: 'Inutilizável', total: stats?.byType.UNDEPLOYABLE, tom: tomDoStatus('UNDEPLOYABLE') },
    { valor: 'PENDING', rotulo: 'Pendente', total: stats?.byType.PENDING, tom: tomDoStatus('PENDING') },
  ];
}

/**
 * Os cartões da vista Baixados: o Total e um por motivo, os zerados inclusive (BV). O baixado
 * não está Em uso nem Disponível: o que diz o estado dele é o motivo, na cor da linha.
 */
export function contagensDosBaixados(stats: AssetStats | undefined): Contagem<string | undefined>[] {
  return [
    { valor: undefined, rotulo: 'Total', total: stats?.retired },
    ...(stats?.byRetiredReason ?? []).map(({ id, name, total }) => ({ valor: id, rotulo: name, total, tom: 'perigo' as const })),
  ];
}
