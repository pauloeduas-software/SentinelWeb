import { ROTULO_DO_STATUS, TOM_DO_STATUS } from '../helpers/licenca.helper';
import type { StatusDaLicenca } from '../types/license.types';
import { PontoDeStatus } from './ui/badge';

/** A coluna Situação da licença entregue: o mesmo ponto da lista de Licenças. */
export default function SituacaoDaEntrega({ status }: { status: StatusDaLicenca | null }) {
  if (!status) return '—';
  return <PontoDeStatus tom={TOM_DO_STATUS[status]}>{ROTULO_DO_STATUS[status]}</PontoDeStatus>;
}
