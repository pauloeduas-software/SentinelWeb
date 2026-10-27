import type { OpcaoFixa } from './catalog-ui.types';

// OS BOTÕES QUE SEPARAM A ABA POR TIPO — "Todos / Ativo / Estoque / Licença" nas
// categorias. Aparece só na aba cuja spec declara `filtroPorTipo`.

interface TipoFiltroProps {
  opcoes: readonly OpcaoFixa[];
  valor: string | undefined;
  onChange: (valor: string | undefined) => void;
}

export default function TipoFiltro({ opcoes, valor, onChange }: TipoFiltroProps) {
  const botoes = [{ value: undefined, label: 'Todos' }, ...opcoes];

  return (
    <div className="flex border border-border-sutil">
      {botoes.map((opcao) => (
        <button
          key={opcao.value ?? 'todos'}
          type="button"
          onClick={() => onChange(opcao.value)}
          className={`px-4 py-2 uppercase tracking-widest transition-colors ${
            valor === opcao.value
              ? 'bg-text-primary text-bg-base'
              : 'text-text-tertiary hover:text-text-primary hover:bg-bg-base'
          }`}
        >
          {opcao.label}
        </button>
      ))}
    </div>
  );
}
