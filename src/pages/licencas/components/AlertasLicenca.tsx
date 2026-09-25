import { AlertTriangle, CalendarClock } from 'lucide-react';
import type { AlertasDeLicenca } from '../../../domain/shared/license.types';
import { corDoStatus, textoDoPrazo } from '../helpers/licenca.helper';

// OS DOIS SINAIS DA LICENÇA, lado a lado — mesma forma do painel de estoque.
//
// Eles respondem perguntas DIFERENTES e por isso não se somam num número só:
// *"o que vence"* é prazo de contrato e *"o que está sem assento"* é capacidade.
// Um contrato vencendo com assentos de sobra e um vigente sem assento livre são
// problemas opostos, e cada um manda procurar outra pessoa na empresa.

interface AlertasLicencaProps {
  alertas: AlertasDeLicenca;
}

export default function AlertasLicenca({ alertas }: AlertasLicencaProps) {
  const { vencendo, assentosBaixos } = alertas;
  if (vencendo.length === 0 && assentosBaixos.length === 0) return null;

  return (
    <div className="grid gap-3 md:grid-cols-2 mb-4">
      {vencendo.length > 0 && (
        <div className="border border-status-warning/30 bg-surface-card p-3 font-mono text-xs">
          <div className="flex items-center gap-2 text-status-warning uppercase tracking-widest text-[10px] mb-2">
            <CalendarClock size={12} /> Vencendo ou vencida ({vencendo.length})
          </div>
          <ul className="space-y-1">
            {vencendo.slice(0, 6).map((alerta) => (
              <li key={alerta.id} className="flex justify-between gap-3">
                <span className="text-text-secondary truncate">{alerta.name}</span>
                <span style={{ color: corDoStatus(alerta.status) }} className="shrink-0">
                  {textoDoPrazo(alerta.diasParaVencer)}
                </span>
              </li>
            ))}
          </ul>
          {vencendo.length > 6 && (
            <p className="text-[10px] text-text-tertiary mt-2">e mais {vencendo.length - 6}…</p>
          )}
        </div>
      )}

      {assentosBaixos.length > 0 && (
        <div className="border border-status-danger/30 bg-surface-card p-3 font-mono text-xs">
          <div className="flex items-center gap-2 text-status-danger uppercase tracking-widest text-[10px] mb-2">
            <AlertTriangle size={12} /> Assentos abaixo do mínimo ({assentosBaixos.length})
          </div>
          <ul className="space-y-1">
            {assentosBaixos.slice(0, 6).map((alerta) => (
              <li key={alerta.id} className="flex justify-between gap-3">
                <span className="text-text-secondary truncate">{alerta.name}</span>
                <span className="text-status-danger shrink-0">
                  {alerta.livres} livre(s), mínimo {alerta.minSeats}
                </span>
              </li>
            ))}
          </ul>
          {assentosBaixos.length > 6 && (
            <p className="text-[10px] text-text-tertiary mt-2">e mais {assentosBaixos.length - 6}…</p>
          )}
        </div>
      )}
    </div>
  );
}
