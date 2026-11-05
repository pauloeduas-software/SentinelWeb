import { ArrowRightLeft, Clock, KeyRound, MapPin, Package } from 'lucide-react';
import { Card } from '../../../../components/ui/card';
import type { EventoDaPessoa } from '../../../../types/person.types';
import { formatarDiaDoInstante } from '../../../../helpers/format.helper';
import { tituloDoEvento } from '../helpers/historico.helper';

// A LINHA DO TEMPO da pessoa: por onde ela passou. QUATRO fontes, uma lista:
//
//   POSSE      o que ela recebeu e devolveu, com a etiqueta do equipamento;
//   POSTO      onde ela sentou e quando saiu, com o turno;
//   LICENCA    as licenças entregues A ELA — não as do computador que ela usa;
//   ESTOQUE    o estoque no NOME dela, por entrega — não o da mesa que ela ocupa.
//
// Colaborador não opera o sistema: não há o que ele FEZ para mostrar aqui.

const ICONE = {
  POSSE: ArrowRightLeft,
  POSTO: MapPin,
  LICENCA: KeyRound,
  ESTOQUE: Package,
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
    return <Card className="py-16 text-center text-sm text-text-tertiary">Carregando histórico…</Card>;
  }

  if (eventos.length === 0) {
    return <Card className="py-16 text-center text-sm text-text-tertiary">Nenhuma entrega, posto, licença nem estoque ainda.</Card>;
  }

  return (
    <div className="space-y-3 text-sm">
      <Card>
        <ul className="divide-y divide-border-sutil">
          {eventos.map((evento) => (
            <Evento key={evento.id} evento={evento} />
          ))}
        </ul>
      </Card>

      {cortado && (
        <p className="text-text-tertiary text-xs leading-relaxed">
          Mostrando os {eventos.length} eventos mais recentes de {total}.
        </p>
      )}
    </div>
  );
}

function Evento({ evento }: { evento: EventoDaPessoa }) {
  const Icone = ICONE[evento.fonte];
  const nota = evento.posse?.notes ?? evento.posto?.notes ?? evento.licenca?.notes ?? evento.estoque?.notes ?? null;

  return (
    <li className="space-y-1 px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Icone className="size-4 shrink-0 text-text-tertiary" />
          <span className="text-text-primary">{tituloDoEvento(evento)}</span>
        </div>

        <span className="flex items-center gap-1.5 text-text-tertiary text-xs tabular-nums shrink-0">
          {/* Tudo é registrado por dia — posse, ocupação, licença e estoque (AM):
              a hora de um dia passado seria inventada. */}
          <Clock className="size-3" /> {formatarDiaDoInstante(evento.at)}
        </span>
      </div>

      {nota && <div className="text-xs text-text-tertiary">{nota}</div>}

    </li>
  );
}
