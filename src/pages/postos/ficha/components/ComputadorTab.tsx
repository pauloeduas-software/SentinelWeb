import { Monitor } from 'lucide-react';
import { Link } from 'react-router-dom';
import TabelaDaFicha from '../../../../components/TabelaDaFicha';
import { Aviso } from '../../../../components/ui/aviso';
import { PontoDeStatus } from '../../../../components/ui/badge';
import { TableLinha, TableSublinha } from '../../../../components/ui/table';
import { formatarDiaDoInstante } from '../../../../helpers/format.helper';
import { tomDoStatus } from '../../../../helpers/status.helper';
import type { AtivoDoPosto } from '../../../../types/workstation.types';
import { TRACO } from '../../helpers/postos.helper';

// O COMPUTADOR DA MESA: o ativo entregue ao posto. Esta aba diz o que está aqui, e
// a do lado, a Máquina, como ele está agora (BX).
//
// SEM DEVOLVER (BN): a linha abre a ficha do computador, onde ele mora.

interface ComputadorTabProps {
  ativos: readonly AtivoDoPosto[];
}

export default function ComputadorTab({ ativos }: ComputadorTabProps) {
  return (
    <>
      {/* Estado que a invariante 19 recusa nas duas portas, e que só um dado de
          antes da regra traria. Se aparecer, precisa ser visto — não escondido
          atrás do primeiro ativo. */}
      {ativos.length > 1 && (
        <Aviso tom="aviso">
          Este posto tem {ativos.length} ativos, e um posto de trabalho tem no máximo um.
          Devolva, na ficha de cada um, os que não ficam nesta mesa. A aba Máquina é a do
          primeiro com máquina; a telemetria de cada um está na ficha dele.
        </Aviso>
      )}

      <TabelaDaFicha
        colunas={[{ rotulo: 'Etiqueta', className: 'w-44' }, { rotulo: 'Modelo' }, { rotulo: 'Categoria', className: 'w-[18%]' }, { rotulo: 'Status', className: 'w-36' }, { rotulo: 'Desde', className: 'w-32' }]}
        icone={Monitor}
        vazio="Nenhum ativo entregue a este posto."
        linhas={ativos.map((ativo) => ({
          id: ativo.id,
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
            ativo.entregueEm ? formatarDiaDoInstante(ativo.entregueEm) : TRACO,
          ],
        }))}
      >
        <span className="max-w-md text-xs leading-relaxed">
          A entrega é feita em{' '}
          <Link to="/computadores" className="text-link hover:underline">Computadores</Link>
          , escolhendo este posto como destino.
        </span>
      </TabelaDaFicha>
    </>
  );
}
