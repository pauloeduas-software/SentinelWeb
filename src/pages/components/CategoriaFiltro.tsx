import { useCatalogOptionsQuery } from '../../domain/catalog/catalog.queries';

// O FILTRO POR CATEGORIA das listagens de Ativos, Licenças e Estoque.
//
// Pelo TIPO, como o `<select>` dos formulários: a tela de Licenças oferece só
// categorias de licença. Vazio é "todas" — e é o único jeito de desligar o
// filtro, então a opção fica sempre no topo.

interface CategoriaFiltroProps {
  tipo: 'ASSET' | 'LICENSE' | 'STOCK';
  valor: string | undefined;
  onChange: (valor: string | undefined) => void;
}

export default function CategoriaFiltro({ tipo, valor, onChange }: CategoriaFiltroProps) {
  const { data: categorias = [] } = useCatalogOptionsQuery('categories', tipo);

  return (
    <select
      value={valor ?? ''}
      onChange={(evento) => onChange(evento.target.value || undefined)}
      aria-label="Filtrar por categoria"
      className="px-3 py-2 bg-surface-card border border-border-sutil text-text-primary focus:outline-none focus:border-text-secondary transition-colors"
    >
      <option value="">Todas as categorias</option>
      {categorias.map((categoria) => (
        <option key={categoria.id} value={categoria.id}>{categoria.name}</option>
      ))}
    </select>
  );
}
