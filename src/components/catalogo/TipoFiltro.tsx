import FiltroDaLista from '../FiltroDaLista';
import type { OpcaoFixa } from './catalog-ui.types';

// O FILTRO QUE SEPARA A ABA POR TIPO: Ativo, Estoque, Licença, nas categorias. Aparece
// só na aba cuja spec declara `filtroPorTipo`.

interface TipoFiltroProps {
  opcoes: readonly OpcaoFixa[];
  valor: string | undefined;
  onChange: (valor: string | undefined) => void;
}

export default function TipoFiltro({ opcoes, valor, onChange }: TipoFiltroProps) {
  return <FiltroDaLista rotulo="Filtrar por tipo" todos="Todos os tipos" valor={valor} onChange={onChange} opcoes={opcoes} />;
}
