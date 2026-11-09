import type { ReactNode } from 'react';
import { Monitor } from 'lucide-react';
import TabelaDaFicha from './TabelaDaFicha';
import { PontoDeStatus } from './ui/badge';
import { TableLinha, TableSublinha } from './ui/table';
import { formatarData, formatarDiaDoInstante } from '../helpers/format.helper';
import { tomDoStatus, type TipoDeStatus } from '../helpers/status.helper';

// O COMPUTADOR NUMA ABA DE FICHA (CE): a mesma tabela no posto e no colaborador. As
// colunas são as da lista de Computadores que cabem na aba, com a série embaixo da
// etiqueta e o fabricante embaixo do modelo, mais as duas datas da entrega. A linha
// abre a ficha do computador, onde mora o Devolver (BN).

export interface ComputadorNaFicha {
  /** A chave da linha: a posse, ou o próprio ativo. */
  id: string;
  ativo: {
    id: string;
    assetTag: string;
    serial: string | null;
    model: { name: string; manufacturer: { name: string }; category: { name: string } };
    status: { name: string; type: TipoDeStatus };
  };
  /** O dia previsto, só no empréstimo com prazo. */
  devolucaoPrevista: string | null;
  /** O instante da entrega. */
  entregueEm: string | null;
}

interface ComputadoresNaFichaProps {
  computadores: readonly ComputadorNaFicha[];
  vazio: string;
  /** A explicação embaixo da frase, com a aba vazia. */
  children?: ReactNode;
}

export default function ComputadoresNaFicha({ computadores, vazio, children }: ComputadoresNaFichaProps) {
  return (
    <TabelaDaFicha
      colunas={[
        { rotulo: 'Etiqueta', className: 'w-44' },
        { rotulo: 'Modelo' },
        { rotulo: 'Categoria', className: 'w-[16%]' },
        { rotulo: 'Status', className: 'w-36' },
        { rotulo: 'Devolução prevista', className: 'w-48' },
        { rotulo: 'Desde', className: 'w-32' },
      ]}
      icone={Monitor}
      vazio={vazio}
      linhas={computadores.map(({ id, ativo, devolucaoPrevista, entregueEm }) => ({
        id,
        para: `/computadores/${ativo.id}`,
        nome: <span className="font-mono">{ativo.assetTag}</span>,
        nota: ativo.serial && <span className="font-mono">SN {ativo.serial}</span>,
        celulas: [
          <>
            <TableLinha>{ativo.model.name}</TableLinha>
            <TableSublinha>{ativo.model.manufacturer.name}</TableSublinha>
          </>,
          ativo.model.category.name,
          <span title={ativo.status.name}><PontoDeStatus tom={tomDoStatus(ativo.status.type)}>{ativo.status.name}</PontoDeStatus></span>,
          formatarData(devolucaoPrevista),
          entregueEm ? formatarDiaDoInstante(entregueEm) : '—',
        ],
      }))}
    >
      {children}
    </TabelaDaFicha>
  );
}
