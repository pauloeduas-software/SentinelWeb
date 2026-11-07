import { Package } from 'lucide-react';
import TabelaDaFicha from '../../../../components/TabelaDaFicha';
import { caminhoDoItem, textoDeUnidades } from '../../../../helpers/estoque.helper';
import { formatarDiaDoInstante } from '../../../../helpers/format.helper';
import type { PostoDetalhe } from '../../../../types/workstation.types';

// O ESTOQUE DESTA MESA. Depois do computador, de propósito: o ativo é o que a
// invariante 19 limita a um; o estoque é o resto da mesa — monitor, teclado, mouse,
// cabo —, entregue por quantidade e sem a mesma trava (docs/decisoes/estoque.md).

interface EstoqueTabProps {
  itens: PostoDetalhe['itens'];
  nomeDoPosto: string;
}

export default function EstoqueTab({ itens, nomeDoPosto }: EstoqueTabProps) {
  return (
    <>
      {itens.length > 0 && (
        <p className="text-sm text-text-secondary">
          Qualquer ocupante atual responde por estas unidades. A devolução é feita na ficha do item.
        </p>
      )}

      <TabelaDaFicha
        colunas={[{ rotulo: 'Item' }, { rotulo: 'Categoria', className: 'w-[24%]' }, { rotulo: 'Quantidade', className: 'w-40' }, { rotulo: 'Desde', className: 'w-32' }]}
        icone={Package}
        vazio="Nenhum item de estoque entregue a este posto."
        linhas={itens.map((entrega) => ({
          id: entrega.id,
          para: caminhoDoItem(entrega.item.id, nomeDoPosto),
          nome: entrega.item.name,
          nota: entrega.notes,
          celulas: [entrega.item.category.name, textoDeUnidades(entrega.unidades), formatarDiaDoInstante(entrega.checkoutAt)],
        }))}
      />
    </>
  );
}
