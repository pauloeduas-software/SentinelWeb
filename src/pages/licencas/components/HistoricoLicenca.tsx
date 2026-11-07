import { ArrowRightLeft, History } from 'lucide-react';
import type { BarraDaFichaProps } from '../../../components/BarraDaFicha';
import LinhaDoTempo from '../../../components/LinhaDoTempo';
import type { EventoDaLicenca } from '../../../types/license.types';
import { formatarDiaDoInstante } from '../../../helpers/format.helper';
import { ACOES_DA_LICENCA } from '../helpers/licenca.helper';

// POR ONDE A LICENÇA PASSOU — entregas e devoluções, e mais nada: o sistema não
// tem trilha de cadastro e edição.

interface HistoricoLicencaProps {
  /** Uma página, do mais recente para o mais antigo. */
  eventos: EventoDaLicenca[];
  carregando: boolean;
  erro: string | null;
  pagina: BarraDaFichaProps;
}

/** "Entregue a Laura Souza", "Devolvida por PC-LAB-03". */
function tituloDoEvento(evento: EventoDaLicenca): string {
  const acao = ACOES_DA_LICENCA[evento.action];
  return `${acao} ${evento.action === 'CHECKOUT' ? 'a' : 'por'} ${evento.entrega.alvoLabel}`;
}

export default function HistoricoLicenca({ eventos, carregando, erro, pagina }: HistoricoLicencaProps) {
  return (
    <LinhaDoTempo
      icone={History}
      vazio="Esta licença ainda não foi entregue."
      carregando={carregando}
      erro={erro}
      pagina={pagina}
      eventos={eventos.map((evento) => ({
        id: evento.id,
        icone: ArrowRightLeft,
        titulo: tituloDoEvento(evento),
        dia: formatarDiaDoInstante(evento.at),
        nota: evento.entrega.notes,
      }))}
    />
  );
}
