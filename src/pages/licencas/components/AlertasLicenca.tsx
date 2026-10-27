import { CalendarClock } from 'lucide-react';
import type { LicencaEmAlerta, MotivoDoAlerta } from '../../../domain/shared/license.types';
import { textoDoPrazo } from '../../helpers/licenca.helper';

// O ALERTA DA LICENÇA — um só: o que encerrou com alguém ainda usando, o que
// venceu e o que vence nos próximos 30 dias, nessa ordem de urgência. Não
// existe alerta de "abaixo do mínimo" (AA). Só nesta tela.
//
// EMBAIXO, A CONTAGEM DE CADA MOTIVO, com link — "2 encerradas em uso · 5
// vencidas · 3 vencendo": cada uma leva ao filtro que mostra todas aquelas,
// e a lista de cima pode ficar curta.

interface AlertasLicencaProps {
  alertas: LicencaEmAlerta[];
  /** Quantas são de verdade — a lista pode vir cortada. */
  total: number;
  contagem: Record<MotivoDoAlerta, number>;
  onIrPara: (motivo: MotivoDoAlerta) => void;
}

/** A ordem do alerta, e o texto de cada contagem. */
const MOTIVOS: readonly { motivo: MotivoDoAlerta; texto: (n: number) => string }[] = [
  { motivo: 'ENCERRADA_EM_USO', texto: (n) => `${n} ${n === 1 ? 'encerrada' : 'encerradas'} em uso` },
  { motivo: 'VENCIDA', texto: (n) => `${n} ${n === 1 ? 'vencida' : 'vencidas'}` },
  { motivo: 'VENCENDO', texto: (n) => `${n} vencendo` },
];

// QUANTAS ESTÃO EM USO diz a urgência, nos três motivos e na mesma frase: a
// vencida com sete pessoas usando é software sem direito de uso; a vencida que
// ninguém usa é só um lembrete de renovar ou encerrar.
function motivoEmTexto(alerta: LicencaEmAlerta): string {
  const prazo = alerta.motivo === 'ENCERRADA_EM_USO' ? 'encerrada' : textoDoPrazo(alerta.diasParaVencer);
  return alerta.emUso > 0 ? `${prazo}, ainda em uso (${alerta.emUso})` : prazo;
}

export default function AlertasLicenca({ alertas, total, contagem, onIrPara }: AlertasLicencaProps) {
  if (alertas.length === 0) return null;

  const comAlgum = MOTIVOS.filter(({ motivo }) => contagem[motivo] > 0);

  return (
    <div className="border border-status-warning/30 bg-surface-card p-3 font-mono text-xs mb-4">
      <div className="flex items-center gap-2 text-status-warning uppercase tracking-widest text-[10px] mb-2">
        <CalendarClock size={12} /> Vencendo, vencidas e encerradas em uso ({total})
      </div>
      <ul className="space-y-1">
        {alertas.map((alerta) => (
          <li key={alerta.id} className="flex justify-between gap-3">
            <span className="text-text-secondary truncate">{alerta.name}</span>
            <span className="text-text-tertiary shrink-0">{motivoEmTexto(alerta)}</span>
          </li>
        ))}
      </ul>
      <p className="flex flex-wrap gap-x-2 text-[10px] text-text-tertiary mt-2">
        {comAlgum.map(({ motivo, texto }, indice) => (
          <span key={motivo} className="flex gap-2">
            {indice > 0 && <span aria-hidden>·</span>}
            <button
              type="button"
              onClick={() => onIrPara(motivo)}
              className="text-text-secondary hover:text-text-primary underline underline-offset-2"
            >
              {texto(contagem[motivo])}
            </button>
          </span>
        ))}
      </p>
    </div>
  );
}
