import { ArrowRightLeft, Clock, KeyRound, MapPin } from 'lucide-react';
import type { EventoDaPessoa } from '../../../../domain/shared/person.types';
import { formatarDiaDoInstante } from '../../../helpers/format.helper';
import { momentoDoEvento } from '../../../helpers/historico.helper';
import { tituloDoEvento } from '../helpers/historico.helper';

// A LINHA DO TEMPO da pessoa: por onde ela passou. TRÊS fontes, uma lista:
//
//   POSSE      o que ela recebeu e devolveu, com a etiqueta do equipamento;
//   POSTO      onde ela sentou e quando saiu, com o turno;
//   LICENCA    as licenças entregues A ELA — não as do computador que ela usa.
//
// Colaborador não opera o sistema: não há o que ele FEZ para mostrar aqui.

const ICONE = {
  POSSE: ArrowRightLeft,
  POSTO: MapPin,
  LICENCA: KeyRound,
} as const;

const COR = {
  POSSE: 'text-status-info',
  POSTO: 'text-status-warning',
  LICENCA: 'text-text-tertiary',
} as const;

interface HistoryPanelProps {
  eventos: EventoDaPessoa[];
  total: number;
  carregando: boolean;
}

export default function HistoryPanel({ eventos, total, carregando }: HistoryPanelProps) {
  // Cálculo fora do JSX: o aviso de corte depende da comparação, não da lista.
  const cortado = total > eventos.length;

  if (carregando) {
    return <p className="font-mono text-xs text-text-tertiary">Carregando histórico…</p>;
  }

  if (eventos.length === 0) {
    return <p className="font-mono text-xs text-text-tertiary">Nenhuma entrega, posto nem licença ainda.</p>;
  }

  return (
    <div className="space-y-4 font-mono text-xs">
      <ul className="space-y-2">
        {eventos.map((evento) => (
          <Evento key={evento.id} evento={evento} />
        ))}
      </ul>

      {cortado && (
        <p className="text-text-tertiary text-[10px] leading-relaxed">
          Mostrando os {eventos.length} eventos mais recentes de {total}.
        </p>
      )}
    </div>
  );
}

function Evento({ evento }: { evento: EventoDaPessoa }) {
  const Icone = ICONE[evento.fonte];
  const nota = evento.posse?.notes ?? evento.posto?.notes ?? evento.licenca?.notes ?? null;

  return (
    <li className="border border-border-sutil p-3 space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Icone size={13} className={`${COR[evento.fonte]} shrink-0`} />
          <span className="text-text-primary">{tituloDoEvento(evento)}</span>
        </div>

        <span className="flex items-center gap-1.5 text-text-tertiary text-[10px] tabular-nums shrink-0">
          {/* A licença é registrada por dia: a hora de um dia passado seria inventada. */}
          <Clock size={11} />{' '}
          {evento.fonte === 'LICENCA' ? formatarDiaDoInstante(evento.at) : momentoDoEvento(evento.at)}
        </span>
      </div>

      {nota && <div className="text-text-secondary text-[10px]">{nota}</div>}

    </li>
  );
}
