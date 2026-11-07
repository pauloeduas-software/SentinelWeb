import { CalendarClock } from 'lucide-react';
import { Aviso } from '../../../components/ui/aviso';
import type { LicencaEmAlerta } from '../../../types/license.types';
import { textoDoPrazo } from '../../../helpers/licenca.helper';

// O ALERTA DA LICENÇA — um só: o que venceu e o que vence nos próximos 30 dias,
// nessa ordem de urgência. A encerrada não entra: ela só encerra com tudo
// devolvido. Não existe alerta de "abaixo do mínimo" (AA). Só nesta tela.
//
// O NÚMERO DE CADA MOTIVO está nos cartões logo acima, que filtram a lista.

interface AlertasLicencaProps {
  alertas: LicencaEmAlerta[];
  /** Quantas são de verdade — a lista pode vir cortada. */
  total: number;
}

// QUANTAS ESTÃO EM USO diz a urgência, nos dois motivos e na mesma frase: a
// vencida com sete pessoas usando é software sem direito de uso; a vencida que
// ninguém usa é só um lembrete de renovar ou encerrar.
function motivoEmTexto(alerta: LicencaEmAlerta): string {
  const prazo = textoDoPrazo(alerta.diasParaVencer);
  return alerta.emUso > 0 ? `${prazo}, ainda em uso (${alerta.emUso})` : prazo;
}

export default function AlertasLicenca({ alertas, total }: AlertasLicencaProps) {
  if (alertas.length === 0) return null;

  return (
    <Aviso tom="aviso" className="mb-4">
      <div className="mb-2 flex items-center gap-2 font-medium">
        <CalendarClock className="size-4 shrink-0" /> Vencendo e vencidos ({total})
      </div>
      {/* O nome fica fora da cor do aviso: a cor é do alerta, não do dado. */}
      <ul className="space-y-1">
        {alertas.map((alerta) => (
          <li key={alerta.id} className="flex justify-between gap-3">
            <span className="truncate text-text-primary">{alerta.name}</span>
            <span className="shrink-0 text-text-secondary">{motivoEmTexto(alerta)}</span>
          </li>
        ))}
      </ul>
    </Aviso>
  );
}
