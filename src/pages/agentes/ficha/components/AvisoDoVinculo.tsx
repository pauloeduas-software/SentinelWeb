import { Link2 } from 'lucide-react';
import { Aviso } from '../../../../components/ui/aviso';
import type { EndpointComTelemetria } from '../../../../types/endpoint.types';

// O AVISO DO VÍNCULO: na máquina sem computador, qual computador ela parece ser (a
// dica) ou por que a série não a ligou sozinha (o aviso do servidor). Situação que
// continua valendo, entre o card e as abas, à vista em todas elas, como o aviso da
// baixa no computador (BR). A lista não o mostra: a frase não cabe na coluna (DI).

/** A frase do aviso, ou `null` quando a máquina não aponta para computador nenhum. */
function frase(maquina: EndpointComTelemetria): string | null {
  if (maquina.dica) {
    return `Ela tem ${maquina.dica.sinal === 'SERIE' ? 'a mesma série' : 'o mesmo nome'} que ${maquina.dica.assetTag}: o Vincular já abre com ele escolhido.`;
  }
  return maquina.aviso;
}

export default function AvisoDoVinculo({ maquina }: { maquina: EndpointComTelemetria }) {
  const texto = maquina.asset ? null : frase(maquina);
  if (!texto) return null;

  return (
    <Aviso tom="aviso">
      <div className="space-y-1">
        <div className="flex items-center gap-2 font-medium">
          <Link2 className="size-4" /> Sem computador
        </div>
        <div className="text-text-primary">{texto}</div>
      </div>
    </Aviso>
  );
}
