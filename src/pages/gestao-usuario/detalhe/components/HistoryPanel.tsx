import { ArrowRightLeft, Clock, FileText, MapPin } from 'lucide-react';
import type { EventoDaPessoa } from '../../../../domain/shared/user.types';
import { momentoDoEvento } from '../../../helpers/historico.helper';
import { lerEventoDaPessoa, tituloDoEvento } from '../helpers/historico.helper';

// A LINHA DO TEMPO da pessoa. TRÊS fontes, uma lista:
//
//   ATIVIDADE  o `ActivityLog` dela — cadastro, edição com o diff campo a
//              campo, credencial definida, lixeira, desligamento;
//   POSSE      o que ela recebeu e devolveu, com a etiqueta do equipamento;
//   POSTO      onde ela sentou e quando saiu, com o turno.
//
// A terceira é a que o D25 exige que exista: `LocationOccupant` não ganha
// coluna de ator porque "quem cadastrou a Laura na Mesa 1?" é pergunta de
// auditoria — e a resposta, dizia a decisão, é o `ActivityLog`.
//
// O que esta lista NÃO mostra é o que a pessoa FEZ como operadora: isso é
// auditoria de operador e vem com o RBAC da F11.

const ICONE = {
  POSSE: ArrowRightLeft,
  POSTO: MapPin,
  ATIVIDADE: FileText,
} as const;

const COR = {
  POSSE: 'text-status-info',
  POSTO: 'text-status-warning',
  ATIVIDADE: 'text-text-tertiary',
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
    return <p className="font-mono text-xs text-text-tertiary">Nada aconteceu com esta pessoa ainda.</p>;
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
  // Leitura do `changes` fora do JSX: o formato varia com a operação e a
  // separação entre diff e dado solto é regra, não marcação.
  const { mudancas, detalhes } = lerEventoDaPessoa(evento);
  const Icone = ICONE[evento.fonte];
  const nota = evento.posse?.notes ?? evento.posto?.notes ?? null;

  return (
    <li className="border border-border-sutil p-3 space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Icone size={13} className={`${COR[evento.fonte]} shrink-0`} />
          <span className="text-text-primary">{tituloDoEvento(evento)}</span>
        </div>

        <span className="flex items-center gap-1.5 text-text-tertiary text-[10px] tabular-nums shrink-0">
          <Clock size={11} /> {momentoDoEvento(evento.at)}
        </span>
      </div>

      {nota && <div className="text-text-secondary text-[10px]">{nota}</div>}

      {mudancas.length > 0 && (
        <ul className="space-y-1">
          {mudancas.map((mudanca) => (
            <li key={mudanca.campo} className="flex flex-wrap items-center gap-2 text-[10px]" title={mudanca.cru}>
              <span className="text-text-tertiary uppercase tracking-widest">{mudanca.rotulo}</span>
              <span className="text-text-tertiary line-through">{mudanca.de}</span>
              <span className="text-text-tertiary">→</span>
              <span className="text-text-primary">{mudanca.para}</span>
            </li>
          ))}
        </ul>
      )}

      {detalhes.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-text-tertiary">
          {detalhes.map((detalhe) => (
            <span key={detalhe.campo} title={detalhe.cru}>
              {detalhe.rotulo}: <span className="text-text-secondary">{detalhe.valor}</span>
            </span>
          ))}
        </div>
      )}
    </li>
  );
}
