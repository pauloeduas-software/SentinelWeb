import {
  ArrowRightLeft, Cpu, History, KeyRound,
} from 'lucide-react';
import type { BarraDaFichaProps } from '../../../../components/BarraDaFicha';
import LinhaDoTempo from '../../../../components/LinhaDoTempo';
import type { EventoDoAtivo } from '../../../../types/asset.types';
import { formatarDiaDoInstante } from '../../../../helpers/format.helper';
import { tituloDoEvento } from '../helpers/historico.helper';

// A LINHA DO TEMPO do ativo: por onde ele passou. Três fontes, uma lista: o
// histórico de posse, que traz o nome de quem recebeu, as licenças entregues
// a esta máquina (as da pessoa responsável ficam na ficha dela) e os
// componentes instalados e retirados (AI). Cadastro, edição e baixa ficam na
// auditoria, no banco (AB).

interface HistoryTabProps {
  eventos: EventoDoAtivo[];
  pagina: BarraDaFichaProps;
  carregando: boolean;
  erro: string | null;
}

const ICONE = { POSSE: ArrowRightLeft, LICENCA: KeyRound, COMPONENTE: Cpu } as const;

export default function HistoryTab({ eventos, pagina, carregando, erro }: HistoryTabProps) {
  return (
    <LinhaDoTempo
      icone={History}
      vazio="Nenhuma entrega, licença nem componente ainda."
      carregando={carregando}
      erro={erro}
      pagina={pagina}
      // A posse, a licença e o componente são registrados por dia (AM).
      eventos={eventos.map((evento) => ({
        id: evento.id,
        icone: ICONE[evento.fonte],
        titulo: tituloDoEvento(evento),
        dia: formatarDiaDoInstante(evento.at),
        nota: evento.posse?.notes ?? evento.licenca?.notes ?? evento.componente?.notes,
      }))}
    />
  );
}
