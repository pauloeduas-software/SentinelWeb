import { useCatalogOptionsQuery } from '../queries/catalog.queries';

// O FILTRO POR CATEGORIA das listagens de Computadores, Licenças e Estoque.
//
// Pelo TIPO, como o `<select>` dos formulários: a tela de Licenças oferece só
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
  // de tipo, ou passou do teto do `/options`. Um `<select>` cujo `value` não
  // casa com nenhuma `<option>` mostra a PRIMEIRA — "Todas as categorias" —
  // enquanto a listagem continua filtrada: a tela diria "sem filtro" e mostraria
  // um recorte. A opção abaixo segura o valor e diz o que ele é, o mesmo recurso
  // do `ReferenceSelect`; escolher "Todas" continua desligando o filtro.
  const foraDaLista = !isPending && Boolean(valor) && !categorias.some((categoria) => categoria.id === valor);

  return (
    <select
      value={valor ?? ''}
      onChange={(evento) => onChange(evento.target.value || undefined)}
      aria-label="Filtrar por categoria"
      className="px-3 py-2 bg-surface-card border border-border-sutil text-text-primary focus:outline-none focus:border-text-secondary transition-colors"
    >
      <option value="">Todas as categorias</option>
      {foraDaLista && <option value={valor}>— filtro atual (fora desta lista) —</option>}
      {categorias.map((categoria) => (
        <option key={categoria.id} value={categoria.id}>{categoria.name}</option>
      ))}
    </select>
  );
}
