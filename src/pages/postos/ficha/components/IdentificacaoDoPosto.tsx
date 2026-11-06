import type { ReactNode } from 'react';
import { MapPin } from 'lucide-react';
import { Link } from 'react-router-dom';
import SeloDoPosto from '../../components/SeloDoPosto';
import CartaoDaFicha, { IconeDaFicha } from '../../../../components/CartaoDaFicha';
import { Dado } from '../../../../components/ui/dado';
import { formatarDiaDoInstante } from '../../../../helpers/format.helper';
import type { PostoDetalhe } from '../../../../types/workstation.types';

// O CARD DE IDENTIFICAÇÃO: o que responde "que mesa é esta e como ela está" antes
// de qualquer aba, como o da ficha do computador.

export default function IdentificacaoDoPosto({ posto, acoes }: { posto: PostoDetalhe; acoes?: ReactNode }) {
  // A lista tem no máximo um ativo: é a invariante 19.
  const computador = posto.ativos[0];

  return (
    <CartaoDaFicha marca={<IconeDaFicha><MapPin /></IconeDaFicha>} acoes={acoes}>
        <Dado rotulo="Situação"><SeloDoPosto posto={posto} /></Dado>
        <Dado rotulo="Localização">{posto.location.name}</Dado>
        <Dado rotulo="Computador">
          {computador && (
            <Link to={`/computadores/${computador.id}`} className="font-mono text-link hover:underline">
              {computador.assetTag}
            </Link>
          )}
        </Dado>
        {/* `createdAt` é instante: o dia sai no fuso de Brasília, não em UTC. */}
        <Dado rotulo="Cadastrado em">{formatarDiaDoInstante(posto.createdAt)}</Dado>
        <Dado rotulo="Notas" largo>{posto.notes}</Dado>
    </CartaoDaFicha>
  );
}
