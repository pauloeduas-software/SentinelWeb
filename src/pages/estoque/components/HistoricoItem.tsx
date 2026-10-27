import { ArrowRightLeft } from 'lucide-react';
import type { EventoDoItem } from '../../../domain/shared/stock.types';
import { formatarDiaDoInstante } from '../../helpers/format.helper';
import { textoDeUnidades } from '../../helpers/estoque.helper';
import { ACOES_DO_ITEM } from '../helpers/estoque.helper';

// POR ONDE O ITEM PASSOU — entregas e devoluções, e mais nada: o total, a
// edição e a desativação ficam só na auditoria, como na licença.

interface HistoricoItemProps {
  /** Uma página, do mais recente para o mais antigo — o paginador mora no detalhe. */
  eventos: EventoDoItem[];
}

export default function HistoricoItem({ eventos }: HistoricoItemProps) {
  if (eventos.length === 0) {
    return <p className="text-text-tertiary">Este item ainda não foi entregue.</p>;
  }

  return (
    <ul className="space-y-2">
      {eventos.map((evento) => <Evento key={evento.id} evento={evento} />)}
    </ul>
  );
}

/** "Entregue a Mesa 1 · 5 unidades", "Devolvida por Laura Souza · 1 unidade". */
function tituloDoEvento(evento: EventoDoItem): string {
  const acao = ACOES_DO_ITEM[evento.action];
  return `${acao} ${evento.action === 'CHECKOUT' ? 'a' : 'por'} ${evento.targetLabel} · ${textoDeUnidades(evento.unidades)}`;
}

function Evento({ evento }: { evento: EventoDoItem }) {
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

      {evento.notes && (
        <div className="text-text-secondary text-[10px]">{evento.notes}</div>
      )}
    </li>
  );
}
