import { Monitor } from 'lucide-react';
import { CartaoVazio } from '../../../../components/ListaVazia';
import TelemetriaDaMaquina from '../../../../components/TelemetriaDaMaquina';
import type { AtivoDoPosto } from '../../../../types/workstation.types';
import { ativosComMaquina } from '../../helpers/postos.helper';

// A MÁQUINA DA MESA, AO VIVO: a telemetria e os comandos, que são o RMM entrando
// pelo ITAM. Esta parte é a convergência vista do lado do POSTO. A telemetria morava
// numa tela de frota, que sabia a medida e não sabia de quem é a máquina; aqui a
// pergunta já vem com dono: "o computador da Mesa 1 está bem?". E é no posto que ela
// se faz, porque é a mesa que tem ocupante e turno — em outra aba, nesta mesma ficha.
//
// A aba é a mesma do computador: só o painel, com a linha que leva a Descobertas,
// onde mora o vínculo (BX, BZ).

interface MaquinaTabProps {
  ativos: readonly AtivoDoPosto[];
}

export default function MaquinaTab({ ativos }: MaquinaTabProps) {
  // Cálculo fora do JSX (docs/referencia/arquitetura.md). A lista tem no
  // máximo um ativo — é a invariante 19 —, e com máquina vinculada é o que tem
  // telemetria para mostrar.
  const comMaquina = ativosComMaquina(ativos);

  if (comMaquina.length === 0) {
    return <CartaoVazio icone={Monitor} carregando={false} erro={null} frase="Nenhuma máquina vinculada a este posto." />;
  }

  return <TelemetriaDaMaquina endpointId={comMaquina[0].endpointId} />;
}
