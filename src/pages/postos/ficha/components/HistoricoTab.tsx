import {
  ArrowRightLeft, History, Package, Users,
} from 'lucide-react';
import { tituloDoEvento } from '../helpers/historico.helper';
import type { BarraDaFichaProps } from '../../../../components/BarraDaFicha';
import LinhaDoTempo from '../../../../components/LinhaDoTempo';
import { formatarDiaDoInstante } from '../../../../helpers/format.helper';
import type { EventoDoPosto } from '../../../../types/workstation.types';

// A LINHA DO TEMPO do posto: o que passou pela mesa (BP). TRÊS fontes, uma lista:
//
//   OCUPACAO   quem entrou e saiu, com o turno;
//   POSSE      o computador entregue e devolvido;
//   ESTOQUE    o estoque entregue à mesa, por entrega.
//
// As outras abas dizem o que ESTÁ, e esta diz o que FOI.

const ICONE = { OCUPACAO: Users, POSSE: ArrowRightLeft, ESTOQUE: Package } as const;

interface HistoricoTabProps {
  eventos: EventoDoPosto[];
  pagina: BarraDaFichaProps;
  carregando: boolean;
  erro: string | null;
}

export default function HistoricoTab({ eventos, pagina, carregando, erro }: HistoricoTabProps) {
  return (
    <LinhaDoTempo
      icone={History}
      vazio="Nenhum responsável, computador nem estoque ainda."
      carregando={carregando}
      erro={erro}
      pagina={pagina}
      // Tudo é registrado por dia (AM).
      eventos={eventos.map((evento) => ({
        id: evento.id,
        icone: ICONE[evento.fonte],
        titulo: tituloDoEvento(evento),
        dia: formatarDiaDoInstante(evento.at),
        nota: evento.ocupacao?.notes ?? evento.posse?.notes ?? evento.estoque?.notes,
      }))}
    />
  );
}
