import FiltroDaLista from './FiltroDaLista';
import { useCatalogOptionsQuery } from '../queries/catalog.queries';

// O FILTRO POR CATEGORIA das listagens de Computadores, Licenças e Estoque.
//
// Pelo TIPO, como o seletor dos formulários: a tela de Licenças oferece só
// categorias de licença, e a de Estoque as de estoque, as de componente (AI) e as de consumível (AJ). Vazio é "todas" — e é o único jeito de desligar o
// filtro, então a opção fica sempre no topo.

interface CategoriaFiltroProps {
  /** Um tipo, ou vários separados por vírgula — o `?type=` do `/options`. */
  tipo: 'ASSET' | 'LICENSE' | 'STOCK,COMPONENT,CONSUMABLE';
  valor: string | undefined;
  onChange: (valor: string | undefined) => void;
}

export default function CategoriaFiltro({ tipo, valor, onChange }: CategoriaFiltroProps) {
  const { data: categorias = [], isPending } = useCatalogOptionsQuery('categories', tipo);

  // O FILTRO APLICADO PODE NÃO ESTAR NA LISTA: a categoria foi excluída, mudou
  // de tipo, ou passou do teto do `/options`. Sem a opção abaixo, a tela diria
  // "Todas as categorias" e mostraria um recorte. Escolher "Todas" desliga o filtro.
  const foraDaLista = !isPending && Boolean(valor) && !categorias.some((categoria) => categoria.id === valor);

  return (
    <FiltroDaLista
      rotulo="Filtrar por categoria"
      todos="Todas as categorias"
      valor={valor}
      onChange={onChange}
      placeholderDaBusca="Buscar categoria…"
      opcoes={[
        ...(foraDaLista && valor ? [{ value: valor, label: 'Filtro atual (fora desta lista)' }] : []),
        ...categorias.map((categoria) => ({ value: categoria.id, label: categoria.name })),
      ]}
    />
  );
}
