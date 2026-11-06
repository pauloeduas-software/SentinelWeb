import type { Contagem } from '../../../components/CartoesDeContagem';
import type { LicencaStats, StatusDoFiltro } from '../../../types/license.types';
import { TOM_DO_STATUS } from '../../../helpers/licenca.helper';

/** Os cartões da tela: o Total e uma situação por cartão, na cor da tabela. */
export function contagensDasLicencas(stats: LicencaStats | undefined): Contagem<StatusDoFiltro | undefined>[] {
  return [
    { valor: undefined, rotulo: 'Total', total: stats?.total },
    { valor: 'ATIVA', rotulo: 'Ativas', total: stats?.ativas, tom: TOM_DO_STATUS.ATIVA },
    { valor: 'VENCENDO', rotulo: 'Vencendo', total: stats?.vencendo, tom: TOM_DO_STATUS.VENCENDO },
    { valor: 'EXPIRADA', rotulo: 'Vencidas', total: stats?.vencidas, tom: TOM_DO_STATUS.EXPIRADA },
    { valor: 'ENCERRADA', rotulo: 'Encerradas', total: stats?.encerradas, tom: TOM_DO_STATUS.ENCERRADA },
  ];
}
