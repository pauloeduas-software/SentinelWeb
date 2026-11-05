import { ArrowRightLeft, Cpu, KeyRound } from 'lucide-react';
import { Card } from '../../../../components/ui/card';
import type { EventoDoAtivo } from '../../../../types/asset.types';
import { formatarDiaDoInstante } from '../../../../helpers/format.helper';
import { tituloDoEvento } from '../helpers/historico.helper';

// A LINHA DO TEMPO do ativo: por onde ele passou. Três fontes, uma lista: o
// histórico de posse, que traz o nome de quem recebeu, as licenças entregues
// a esta máquina (as da pessoa responsável ficam na ficha dela) e os
// componentes instalados e retirados (AI). Cadastro, edição e baixa ficam na
// auditoria, no banco (AB).

interface HistoryTabProps {
  eventos: EventoDoAtivo[];
  total: number;
  carregando: boolean;
}

export default function HistoryTab({ eventos, total, carregando }: HistoryTabProps) {
  // Cálculo fora do JSX: o aviso de corte depende da comparação, não da lista.
  const cortado = total > eventos.length;

  if (carregando) return <p className="text-sm text-text-tertiary">Carregando…</p>;

  if (eventos.length === 0) {
    return <Card className="p-6 text-sm text-text-tertiary">Nenhuma entrega, licença nem componente ainda.</Card>;
  }

  return (
    <div className="space-y-3">
      <Card className="overflow-hidden">
        <ul className="divide-y divide-border-sutil text-sm">
          {eventos.map((evento) => (
            <Evento key={evento.id} evento={evento} />
          ))}
        </ul>
      </Card>

      {cortado && (
        <p className="text-xs text-text-tertiary">
          Mostrando os {eventos.length} eventos mais recentes de {total}.
        </p>
      )}
    </div>
  );
}

function Evento({ evento }: { evento: EventoDoAtivo }) {
  const dePosse = evento.fonte === 'POSSE';
  const notas = evento.posse?.notes ?? evento.licenca?.notes ?? evento.componente?.notes;
  const Icone = evento.fonte === 'COMPONENTE' ? Cpu : KeyRound;

  return (
    <li className="space-y-1 px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="flex items-center gap-2 text-text-secondary">
          {dePosse
            ? <ArrowRightLeft className="size-4 shrink-0 text-text-tertiary" />
            : <Icone className="size-4 shrink-0 text-text-tertiary" />}
          {tituloDoEvento(evento)}
        </span>

        {/* A posse, a licença e o componente são registrados por dia (AM): a
            hora de um dia passado seria inventada. */}
        <span className="shrink-0 text-xs tabular-nums text-text-tertiary">{formatarDiaDoInstante(evento.at)}</span>
      </div>

      {notas && <div className="text-xs text-text-tertiary">{notas}</div>}
    </li>
  );
}
