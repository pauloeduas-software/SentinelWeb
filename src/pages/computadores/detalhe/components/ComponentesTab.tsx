import { Cpu } from 'lucide-react';
import { Link } from 'react-router-dom';
import TabelaDaFicha from '../../../../components/TabelaDaFicha';
import type { EntregaNaFicha } from '../../../../types/stock.types';
import { formatarDiaDoInstante } from '../../../../helpers/format.helper';
import { caminhoDoItem, textoDeUnidades } from '../../../../helpers/estoque.helper';

// A ABA COMPONENTES — "o que está instalado NESTA máquina agora" (AI): a
// memória, o SSD. Uma linha por entrega, como a ficha do posto.
//
// SÓ AS ENTREGAS ABERTAS: as já retiradas estão na aba Histórico. O componente
// fica no computador mesmo quando ele muda de mãos — a peça está dentro dele.
//
// SEM RETIRAR: ele mora no detalhe do item, como a devolução de licença mora na
// tela de Licenças. A linha do item leva até lá, já filtrada por este computador.

interface ComponentesTabProps {
  componentes: EntregaNaFicha[];
  /** A etiqueta do computador: o link leva ao detalhe do item já filtrado por ela. */
  assetTag: string;
  carregando: boolean;
  erro: string | null;
}

export default function ComponentesTab({ componentes, assetTag, carregando, erro }: ComponentesTabProps) {
  return (
    <TabelaDaFicha
      colunas={[{ rotulo: 'Componente' }, { rotulo: 'Categoria', className: 'w-[24%]' }, { rotulo: 'Quantidade', className: 'w-40' }, { rotulo: 'Desde', className: 'w-32' }]}
      icone={Cpu}
      carregando={carregando}
      erro={erro}
      vazio="Nenhum componente instalado neste ativo."
      linhas={componentes.map((entrega) => ({
        id: entrega.id,
        para: caminhoDoItem(entrega.item.id, assetTag),
        nome: entrega.item.name,
        nota: entrega.notes,
        celulas: [entrega.item.category.name, textoDeUnidades(entrega.unidades), formatarDiaDoInstante(entrega.checkoutAt)],
      }))}
    >
      <span className="max-w-md text-center text-xs leading-relaxed">
        Memória e SSD são itens de categoria Componente, entregues a um computador pela tela de{' '}
        <Link to="/estoque" className="text-link hover:underline">Estoque</Link>.
      </span>
    </TabelaDaFicha>
  );
}
