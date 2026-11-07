import { Monitor } from 'lucide-react';
import { Link } from 'react-router-dom';
import TabelaDaFicha from '../../../../components/TabelaDaFicha';
import TelemetriaDaMaquina from '../../../../components/TelemetriaDaMaquina';
import { Aviso } from '../../../../components/ui/aviso';
import { PontoDeStatus } from '../../../../components/ui/badge';
import { TableLinha, TableSublinha } from '../../../../components/ui/table';
import { formatarDiaDoInstante } from '../../../../helpers/format.helper';
import { tomDoStatus } from '../../../../helpers/status.helper';
import type { AtivoDoPosto } from '../../../../types/workstation.types';
import { TRACO, ativosComMaquina } from '../../helpers/postos.helper';

// O COMPUTADOR DA MESA: o ativo entregue ao posto, e a TELEMETRIA, que é o RMM
// entrando pelo ITAM. Ela morava numa tela de frota, que media as máquinas sem
// saber de quem são; aqui a medida chega com mesa, ocupante e turno em volta. A
// ponte da convergência, vista do lado do posto.
//
// SEM DEVOLVER (BN): a linha abre a ficha do computador, onde ele mora.

interface ComputadorTabProps {
  ativos: readonly AtivoDoPosto[];
}

export default function ComputadorTab({ ativos }: ComputadorTabProps) {
  // Cálculo fora do JSX (docs/referencia/arquitetura.md). A lista tem no
  // máximo um ativo — é a invariante 19 —, e com máquina vinculada é o que tem
  // telemetria para mostrar.
  const comMaquina = ativosComMaquina(ativos);

  return (
    <>
      {/* Estado que a invariante 19 recusa nas duas portas, e que só um dado de
          antes da regra traria. Se aparecer, precisa ser visto — não escondido
          atrás do primeiro ativo. */}
      {ativos.length > 1 && (
        <Aviso tom="aviso">
          Este posto tem {ativos.length} ativos, e um posto de trabalho tem no máximo um.
          Devolva, na ficha de cada um, os que não ficam nesta mesa. O painel abaixo é do
          primeiro com máquina; a telemetria de cada um está na ficha dele, na aba Máquina.
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

      {/* ── O COMPUTADOR DA MESA, AO VIVO ────────────────────────────────
          Esta parte é a convergência vista do lado do POSTO. A telemetria
          morava numa tela de frota, que sabia a medida e não sabia de quem é
          a máquina; aqui a pergunta já vem com dono: "o computador da Mesa 1
          está bem?". E é no posto que ela se faz, porque é a mesa que tem
          ocupante e turno — na aba ao lado, nesta mesma ficha. */}
      {comMaquina.length > 0 && (
        <>
          {/* QUAL ativo é este painel: sem a etiqueta a telemetria
              ficaria flutuando sem dono dentro da ficha. */}
          <p className="text-xs text-text-tertiary">
            <span className="font-mono">{comMaquina[0].assetTag}</span>
            {comMaquina[0].name && ` · ${comMaquina[0].name}`}
          </p>

          <TelemetriaDaMaquina endpointId={comMaquina[0].endpointId} />
        </>
      )}
    </>
  );
}
