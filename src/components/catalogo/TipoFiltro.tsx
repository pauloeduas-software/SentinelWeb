import { Segmentado } from '../ui/segmentado';
import type { OpcaoFixa } from './catalog-ui.types';

// OS BOTÕES QUE SEPARAM A ABA POR TIPO — "Todos / Ativo / Estoque / Licença" nas
// categorias. Aparece só na aba cuja spec declara `filtroPorTipo`.

interface TipoFiltroProps {
  opcoes: readonly OpcaoFixa[];
  valor: string | undefined;
  onChange: (valor: string | undefined) => void;
}

export default function TipoFiltro({ opcoes, valor, onChange }: TipoFiltroProps) {
  return (
    <Segmentado
      opcoes={[{ valor: undefined, rotulo: 'Todos' }, ...opcoes.map((opcao) => ({ valor: opcao.value, rotulo: opcao.label }))]}
      valor={valor}
      onChange={onChange}
    />
  );
}
