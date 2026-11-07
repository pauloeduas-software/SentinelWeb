import type { ReactNode } from 'react';
import { Package } from 'lucide-react';
import CartaoDaFicha, { IconeDaFicha } from '../../../../components/CartaoDaFicha';
import { PontoDeStatus } from '../../../../components/ui/badge';
import { Dado } from '../../../../components/ui/dado';
import { formatarDiaDoInstante } from '../../../../helpers/format.helper';
import type { ItemDeEstoque } from '../../../../types/stock.types';
import { classeDaConta, resumoDaContagem } from '../../helpers/estoque.helper';

// O CARD DE IDENTIFICAÇÃO: o que responde "que item é este e quanto sobrou" antes de
// qualquer aba, como o da ficha do posto.

interface Props {
  item: ItemDeEstoque;
  acoes?: ReactNode;
}

export default function IdentificacaoDoItem({ item, acoes }: Props) {
  return (
    <CartaoDaFicha marca={<IconeDaFicha><Package /></IconeDaFicha>} acoes={acoes}>
      <Dado rotulo="Status">
        <PontoDeStatus tom={item.isActive ? 'sucesso' : 'aviso'}>{item.isActive ? 'Ativo' : 'Desativado'}</PontoDeStatus>
      </Dado>
      <Dado rotulo="Quantidade">
        <span className={item.disponivel < 0 ? classeDaConta(item) : ''}>{resumoDaContagem(item)}</span>
      </Dado>
      <Dado rotulo="Categoria">{item.category.name}</Dado>
      <Dado rotulo="Localização">{item.location?.name}</Dado>
      {/* `createdAt` é instante: o dia sai no fuso de Brasília, não em UTC. */}
      <Dado rotulo="Cadastrado em">{formatarDiaDoInstante(item.createdAt)}</Dado>
      <Dado rotulo="Notas" largo>{item.notes}</Dado>
    </CartaoDaFicha>
  );
}
