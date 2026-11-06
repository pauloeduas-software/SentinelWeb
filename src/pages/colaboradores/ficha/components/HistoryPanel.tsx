import {
  ArrowRightLeft, History, KeyRound, MapPin, Package,
} from 'lucide-react';
import type { BarraDaFichaProps } from '../../../../components/BarraDaFicha';
import LinhaDoTempo from '../../../../components/LinhaDoTempo';
import type { EventoDaPessoa } from '../../../../types/person.types';
import { formatarDiaDoInstante } from '../../../../helpers/format.helper';
import { tituloDoEvento } from '../helpers/historico.helper';

// A LINHA DO TEMPO da pessoa: por onde ela passou. QUATRO fontes, uma lista:
//
//   POSSE      o que ela recebeu e devolveu, com a etiqueta do equipamento;
//   POSTO      onde ela sentou e quando saiu, com o turno;
//   LICENCA    as licenças entregues A ELA — não as do computador que ela usa;
//   ESTOQUE    o estoque no NOME dela, por entrega — não o da mesa que ela ocupa.
//
// Colaborador não opera o sistema: não há o que ele FEZ para mostrar aqui.

const ICONE = {
  POSSE: ArrowRightLeft,
  POSTO: MapPin,
  LICENCA: KeyRound,
  ESTOQUE: Package,
} as const;

interface HistoryPanelProps {
  eventos: EventoDaPessoa[];
  pagina: BarraDaFichaProps;
  carregando: boolean;
  erro: string | null;
}

export default function HistoryPanel({ eventos, pagina, carregando, erro }: HistoryPanelProps) {
  return (
    <LinhaDoTempo
      icone={History}
      vazio="Nenhuma entrega, posto, licença nem estoque ainda."
      carregando={carregando}
      erro={erro}
      pagina={pagina}
      // Tudo é registrado por dia: posse, ocupação, licença e estoque (AM).
      eventos={eventos.map((evento) => ({
        id: evento.id,
        icone: ICONE[evento.fonte],
        titulo: tituloDoEvento(evento),
        dia: formatarDiaDoInstante(evento.at),
        nota: evento.posse?.notes ?? evento.posto?.notes ?? evento.licenca?.notes ?? evento.estoque?.notes,
      }))}
    />
  );
}
