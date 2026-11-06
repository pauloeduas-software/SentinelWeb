import { Seletor, type OpcaoDoSeletor } from './ui/seletor';

// O FILTRO DA BARRA DA LISTA: a categoria, o tipo. Um seletor do mesmo tamanho e do
// mesmo fundo da busca ao lado (BB). Vazio é "todas": é o único jeito de desligar o
// filtro, então a opção fica sempre no topo.

interface FiltroDaListaProps {
  rotulo: string;
  /** O que aparece com o filtro desligado: "Todas as categorias". */
  todos: string;
  valor: string | undefined;
  onChange: (valor: string | undefined) => void;
  opcoes: readonly OpcaoDoSeletor[];
  placeholderDaBusca?: string;
  /** A linha embaixo da lista: a consulta que falhou. */
  rodape?: string;
}

export default function FiltroDaLista({ rotulo, todos, valor, onChange, opcoes, placeholderDaBusca, rodape }: FiltroDaListaProps) {
  return (
    <Seletor
      ariaLabel={rotulo}
      value={valor ?? ''}
      onChange={(novo) => onChange(novo || undefined)}
      vazio={todos}
      comOpcaoVazia
      placeholderDaBusca={placeholderDaBusca}
      className="w-full sm:w-56 [&_[role=combobox]]:bg-surface-card"
      opcoes={opcoes}
      rodape={rodape}
    />
  );
}
