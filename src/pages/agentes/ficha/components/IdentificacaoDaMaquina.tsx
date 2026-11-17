import type { ReactNode } from 'react';
import { Radar } from 'lucide-react';
import CartaoDaFicha, { IconeDaFicha } from '../../../../components/CartaoDaFicha';
import DadosDaMaquina from '../../../../components/DadosDaMaquina';
import { PontoDeStatus } from '../../../../components/ui/badge';
import { Dado } from '../../../../components/ui/dado';
import { formatarDataHora } from '../../../../helpers/format.helper';
import type { EndpointComTelemetria } from '../../../../types/endpoint.types';

// O CARD DE IDENTIFICAÇÃO DA MÁQUINA (DF): se ela está conectada, quando falou por
// último e tudo o que ela diz de si, antes de qualquer aba. É o resumo do host do
// Fleet e do NinjaOne, no molde das outras fichas (BS).

interface Props {
  maquina: EndpointComTelemetria;
  acoes?: ReactNode;
}

export default function IdentificacaoDaMaquina({ maquina, acoes }: Props) {
  const online = maquina.status === 'ONLINE';

  return (
    <CartaoDaFicha marca={<IconeDaFicha><Radar /></IconeDaFicha>} acoes={acoes}>
      <Dado rotulo="Status">
        <PontoDeStatus tom={online ? 'sucesso' : 'neutro'}>{online ? 'Conectado' : 'Desconectado'}</PontoDeStatus>
      </Dado>
      <Dado rotulo="Último contato">{formatarDataHora(maquina.lastSeen)}</Dado>
      <Dado rotulo="Computador">
        {maquina.asset && <span className="font-mono">{maquina.asset.assetTag}</span>}
      </Dado>
      <DadosDaMaquina maquina={maquina} />
    </CartaoDaFicha>
  );
}
