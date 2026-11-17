import { Link2 } from 'lucide-react';
import ComputadoresNaFicha from '../../../../components/ComputadoresNaFicha';
import { Button } from '../../../../components/ui/button';
import type { EndpointComTelemetria } from '../../../../types/endpoint.types';

// O COMPUTADOR QUE A MÁQUINA É (DF): a mesma tabela da aba Computador do posto (CE),
// e a linha abre a ficha dele, onde moram o responsável e a entrega.
//
// SEM COMPUTADOR, a aba diz o que a lista diz na sublinha: qual computador ela parece
// ser (a dica), ou por que a série não a ligou sozinha (o aviso), e o Vincular.

interface Props {
  maquina: EndpointComTelemetria;
  onVincular: () => void;
}

/** A frase de baixo, na máquina sem computador. */
function explicacao(maquina: EndpointComTelemetria): string {
  if (maquina.dica) {
    return `${maquina.dica.sinal === 'SERIE' ? 'Ela tem a mesma série' : 'Ela tem o mesmo nome'} que ${maquina.dica.assetTag}: o Vincular já abre com ele escolhido.`;
  }
  return maquina.aviso ?? 'Nem a série nem o nome dela apontam para um computador cadastrado.';
}

export default function ComputadorTab({ maquina, onVincular }: Props) {
  const { asset } = maquina;

  return (
    <ComputadoresNaFicha
      computadores={asset ? [{ id: asset.id, ativo: asset, devolucaoPrevista: null, entregueEm: null }] : []}
      vazio="Esta máquina não está vinculada a um computador."
      semEntrega
    >
      <span className="flex max-w-md flex-col items-center gap-3 text-xs leading-relaxed">
        {explicacao(maquina)}
        <Button size="sm" onClick={onVincular}><Link2 /> Vincular a um computador</Button>
      </span>
    </ComputadoresNaFicha>
  );
}
