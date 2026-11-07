import type { ReactNode } from 'react';
import { Monitor } from 'lucide-react';
import { Link } from 'react-router-dom';
import CartaoDaFicha, { IconeDaFicha } from '../../../../components/CartaoDaFicha';
import { PontoDeStatus } from '../../../../components/ui/badge';
import { Dado } from '../../../../components/ui/dado';
import { formatarDiaDoInstante } from '../../../../helpers/format.helper';
import type { Asset } from '../../../../types/asset.types';
import { seloDaSaida } from '../../helpers/baixa.helper';
import { tomDoStatus } from '../../../../helpers/status.helper';
import { nomeDoResponsavel } from '../../../../helpers/responsavel.helper';

// O CARD DE IDENTIFICAÇÃO: o que responde "que máquina é esta, de quem é e onde
// está" antes de qualquer aba. O que é do catálogo e da compra fica em Detalhes.

export default function IdentificacaoCard({ asset, acoes }: { asset: Asset; acoes: ReactNode }) {
  // Cálculo fora do JSX (docs/referencia/arquitetura.md).
  const selo = seloDaSaida(asset);

  return (
    <CartaoDaFicha marca={<IconeDaFicha><Monitor /></IconeDaFicha>} acoes={acoes}>
        <Dado rotulo="Status">
          {/* O baixado diz quando saiu, como na lista. */}
          {selo
            ? <PontoDeStatus tom="aviso">{selo}</PontoDeStatus>
            : <PontoDeStatus tom={tomDoStatus(asset.status.type)}>{asset.status.name}</PontoDeStatus>}
        </Dado>
        <Dado rotulo="Número de série">
          {asset.serial && <span className="font-mono">{asset.serial}</span>}
        </Dado>
        <Dado rotulo="Nome / apelido">{asset.name}</Dado>
        <Dado rotulo="Responsáveis">{nomeDoResponsavel(asset.posse)}</Dado>
        {/* NUM POSTO, o computador está onde o posto fica (AW), e a
            localização dele é para onde volta na devolução — a atual e a
            padrão do Snipe-IT. Fora de posto, é onde ele está guardado. */}
        {asset.postoAtual ? (
          <>
            <Dado rotulo="Localização">
              {asset.postoAtual.location.name} ·{' '}
              <Link to={`/postos/${asset.postoAtual.id}`} className="text-link hover:underline">
                {asset.postoAtual.name}
              </Link>
            </Dado>
            <Dado rotulo="Volta para">{asset.location?.name}</Dado>
          </>
        ) : (
          <Dado rotulo="Localização">{asset.location?.name}</Dado>
        )}
        {/* `createdAt` é instante: o dia sai no fuso de Brasília, não em UTC. */}
        <Dado rotulo="Cadastrado em">{formatarDiaDoInstante(asset.createdAt)}</Dado>
    </CartaoDaFicha>
  );
}
