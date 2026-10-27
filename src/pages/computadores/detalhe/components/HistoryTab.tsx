import { ArrowRightLeft, Clock, KeyRound } from 'lucide-react';
import type { EventoDoAtivo } from '../../../../domain/shared/asset.types';
import { formatarDiaDoInstante } from '../../../helpers/format.helper';
import { momentoDoEvento } from '../../../helpers/historico.helper';
import { tituloDoEvento } from '../helpers/historico.helper';

// A LINHA DO TEMPO do ativo: por onde ele passou. Duas fontes, uma lista: o
// histórico de posse, que traz o nome de quem recebeu, e as licenças entregues
// a esta máquina (as da pessoa responsável ficam na ficha dela). Cadastro,
// edição e baixa ficam na auditoria, no banco (AB).

interface HistoryTabProps {
  eventos: EventoDoAtivo[];
  total: number;
  carregando: boolean;
}

export default function HistoryTab({ eventos, total, carregando }: HistoryTabProps) {
  // Cálculo fora do JSX: o aviso de corte depende da comparação, não da lista.
  const cortado = total > eventos.length;

  if (carregando) return <div className="text-text-tertiary">Carregando…</div>;

  if (eventos.length === 0) {
    return <div className="text-text-tertiary">Nenhuma entrega nem licença ainda.</div>;
  }

  return (
    <div className="space-y-4">
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

function Evento({ evento }: { evento: EventoDoAtivo }) {
  const dePosse = evento.fonte === 'POSSE';
  const deLicenca = evento.fonte === 'LICENCA';
  const notas = evento.posse?.notes ?? evento.licenca?.notes;

  return (
    <li className="border border-border-sutil p-3 space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          {dePosse
            ? <ArrowRightLeft size={13} className="text-status-info shrink-0" />
            : <KeyRound size={13} className="text-text-tertiary shrink-0" />}
          <span className="text-text-primary">{tituloDoEvento(evento)}</span>
        </div>

        <span className="flex items-center gap-1.5 text-text-tertiary text-[10px] tabular-nums shrink-0">
          {/* A licença é registrada por dia: a hora de um dia passado seria inventada. */}
          <Clock size={11} /> {deLicenca ? formatarDiaDoInstante(evento.at) : momentoDoEvento(evento.at)}
        </span>
      </div>

      {notas && (
        <div className="text-text-secondary text-[10px]">{notas}</div>
      )}

    </li>
  );
}
