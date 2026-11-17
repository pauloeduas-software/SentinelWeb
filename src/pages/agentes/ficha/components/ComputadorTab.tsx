import { Link2 } from 'lucide-react';
import ComputadoresNaFicha from '../../../../components/ComputadoresNaFicha';
import { Button } from '../../../../components/ui/button';
import type { EndpointComTelemetria } from '../../../../types/endpoint.types';

// O COMPUTADOR QUE A MÁQUINA É (DF): a mesma tabela da aba Computador do posto (CE),
// e a linha abre a ficha dele, onde moram o responsável e a entrega.
//
// SEM COMPUTADOR, a aba fica com o Vincular. Qual computador ela parece ser, ou por
// que a série não a ligou, está no aviso acima das abas (`AvisoDoVinculo`, DI).

interface Props {
  maquina: EndpointComTelemetria;
  /** Outra ação da máquina em andamento: o Vincular espera, como o do card. */
  ocupado: boolean;
  onVincular: () => void;
}

export default function ComputadorTab({ maquina, ocupado, onVincular }: Props) {
  const { asset } = maquina;

  return (
    <ComputadoresNaFicha
      computadores={asset ? [{ id: asset.id, ativo: asset, devolucaoPrevista: null, entregueEm: null }] : []}
      vazio="Esta máquina não está vinculada a um computador."
      semEntrega
    >
      <Button size="sm" disabled={ocupado} onClick={onVincular}><Link2 /> Vincular a um computador</Button>
    </ComputadoresNaFicha>
  );
}
