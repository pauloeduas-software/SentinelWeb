import { ArrowRightLeft, History } from 'lucide-react';
import LinhaDoTempo from '../../../components/LinhaDoTempo';
import type { EventoDoItem } from '../../../types/stock.types';
import { formatarDiaDoInstante } from '../../../helpers/format.helper';
import { tituloDoEvento } from '../helpers/estoque.helper';

// POR ONDE O ITEM PASSOU — entregas e devoluções (no componente, instalação e
// retirada, AI), e mais nada: o total, a edição e a desativação ficam só na
// auditoria, como na licença.

interface HistoricoItemProps {
  /** Uma página, do mais recente para o mais antigo — o paginador mora no detalhe. */
  eventos: EventoDoItem[];
  carregando: boolean;
  erro: string | null;
}

export default function HistoricoItem({ eventos, carregando, erro }: HistoricoItemProps) {
  return (
    <LinhaDoTempo
      icone={History}
      vazio="Este item ainda não foi entregue."
      carregando={carregando}
      erro={erro}
      eventos={eventos.map((evento) => ({
        id: evento.id,
        icone: ArrowRightLeft,
        titulo: tituloDoEvento(evento),
        dia: formatarDiaDoInstante(evento.at),
        nota: evento.notes,
      }))}
    />
  );
}
