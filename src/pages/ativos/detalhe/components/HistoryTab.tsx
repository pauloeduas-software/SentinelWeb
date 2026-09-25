import { ArrowRightLeft, Clock, FileText } from 'lucide-react';
import type { EventoDoAtivo } from '../../../../domain/shared/asset.types';
import { momentoDoEvento } from '../../../helpers/historico.helper';
import { lerEventoDoAtivo, tituloDoEvento } from '../helpers/historico.helper';

// A LINHA DO TEMPO do ativo. Duas fontes, uma lista (D18): o `ActivityLog` —
// cadastro, edição com o diff campo a campo, lixeira, descomissionamento — e o
// histórico de posse, que traz o nome de quem recebeu.
//
// NÃO existe tabela `AssetLog`: o `ActivityLog` já grava o diff na mesma
// transação da operação, e uma segunda trilha só criaria a pergunta "por que as
// duas não batem?".

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
    return <div className="text-text-tertiary">Nada aconteceu com este ativo ainda.</div>;
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

      <p className="text-text-tertiary text-[10px] leading-relaxed border-t border-border-sutil pt-3">
        Quem fez cada operação passa a ser registrado a partir da autenticação (Fase 3) — o que já
        aconteceu continua sem autor, de propósito: preencher agora seria inventar.
      </p>
    </div>
  );
}

function Evento({ evento }: { evento: EventoDoAtivo }) {
  // Leitura do `changes` fora do JSX: o formato varia com a operação e a
  // separação entre diff e dado solto é regra, não marcação.
  const { mudancas, detalhes } = lerEventoDoAtivo(evento);
  const dePosse = evento.fonte === 'POSSE';

  return (
    <li className="border border-border-sutil p-3 space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          {dePosse
            ? <ArrowRightLeft size={13} className="text-status-info shrink-0" />
            : <FileText size={13} className="text-text-tertiary shrink-0" />}
          <span className="text-text-primary">{tituloDoEvento(evento)}</span>
        </div>

        <span className="flex items-center gap-1.5 text-text-tertiary text-[10px] tabular-nums shrink-0">
          <Clock size={11} /> {momentoDoEvento(evento.at)}
        </span>
      </div>

      {evento.posse?.notes && (
        <div className="text-text-secondary text-[10px]">{evento.posse.notes}</div>
      )}

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
