import { ArrowRightLeft } from 'lucide-react';
import type { EventoDaLicenca } from '../../../domain/shared/license.types';
import { formatarDiaDoInstante } from '../../helpers/format.helper';
import { ACOES_DA_LICENCA } from '../helpers/licenca.helper';

// POR ONDE A LICENÇA PASSOU — entregas e devoluções, e mais nada: o sistema não
// tem trilha de cadastro e edição.

interface HistoricoLicencaProps {
  /** Uma página, do mais recente para o mais antigo — o paginador mora no detalhe. */
  eventos: EventoDaLicenca[];
}

export default function HistoricoLicenca({ eventos }: HistoricoLicencaProps) {
  if (eventos.length === 0) {
    return <p className="text-text-tertiary">Esta licença ainda não foi entregue.</p>;
  }

  return (
    <ul className="space-y-2">
      {eventos.map((evento) => <Evento key={evento.id} evento={evento} />)}
    </ul>
  );
}

/** "Entregue a Laura Souza", "Devolvida por PC-LAB-03". */
function tituloDoEvento(evento: EventoDaLicenca): string {
  const acao = ACOES_DA_LICENCA[evento.action];
  return `${acao} ${evento.action === 'CHECKOUT' ? 'a' : 'por'} ${evento.entrega.alvoLabel}`;
}

function Evento({ evento }: { evento: EventoDaLicenca }) {
  return (
    <li className="border border-border-sutil p-3 space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="flex items-center gap-2 text-text-secondary">
          <ArrowRightLeft size={12} />
          {tituloDoEvento(evento)}
        </span>
        {/* Só o dia: a entrega e a devolução são registradas por dia. */}
        <span className="text-[10px] text-text-tertiary">{formatarDiaDoInstante(evento.at)}</span>
      </div>

      {evento.entrega.notes && (
        <div className="text-text-secondary text-[10px]">{evento.entrega.notes}</div>
      )}
    </li>
  );
}
