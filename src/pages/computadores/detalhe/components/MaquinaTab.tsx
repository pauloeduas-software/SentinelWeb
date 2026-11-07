import { Monitor } from 'lucide-react';
import { CartaoVazio } from '../../../../components/ListaVazia';
import TelemetriaDaMaquina from '../../../../components/TelemetriaDaMaquina';
import type { MaquinaDoAtivo } from '../../../../types/reconciliation.types';

// A ABA MÁQUINA — o que o AGENTE vê deste ativo.
//
// Nasceu com a convergência: até aqui, o ativo sabia o que a empresa comprou e a
// máquina sabia o que ela é, e os dois nunca se falavam.
//
// ─────────────────────────────────────────────────────────────────────────────
// A TELEMETRIA E OS COMANDOS CHEGARAM AQUI, e vieram de uma tela que saiu.
//
// Eram `/`: a frota inteira em cards, com três barras cada. Aquela tela sabia a
// medida e não sabia de quem é a máquina; esta ficha sabe o patrimônio, a pessoa
// e o posto, e passou a saber a medida também.
//
// O painel é `components/TelemetriaDaMaquina` porque a ficha do POSTO
// mostra o mesmo — o computador da mesa é um ativo, visto do outro lado. A aba é
// só ele: o vínculo mora em Descobertas, e a linha do painel leva para lá (BZ).
// ─────────────────────────────────────────────────────────────────────────────

interface MaquinaTabProps {
  maquina: MaquinaDoAtivo | undefined;
  carregando: boolean;
  erro: string | null;
}

export default function MaquinaTab({ maquina, carregando, erro }: MaquinaTabProps) {
  if (!maquina?.endpointId) {
    return (
      <CartaoVazio icone={Monitor} carregando={carregando} erro={erro} frase="Nenhuma máquina vinculada a este ativo.">
        <span className="max-w-md text-xs leading-relaxed">
          Se este ativo deveria ter agente, a máquina aparece em Descobertas assim que ele mandar o
          primeiro sinal.
        </span>
      </CartaoVazio>
    );
  }

  return <TelemetriaDaMaquina endpointId={maquina.endpointId} />;
}
