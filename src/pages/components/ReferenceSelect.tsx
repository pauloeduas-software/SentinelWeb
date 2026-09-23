import { useCatalogOptionsQuery } from '../../domain/catalog/catalog.queries';

// `<select>` alimentado por outra tabela (/options).
//
// É o ÚNICO componente desta pasta que busca dado, e por um motivo concreto: a
// quantidade de campos-referência muda de aba para aba (Modelos tem dois,
// Fornecedores nenhum). Buscar no hook da página exigiria chamar um hook por
// campo dentro de um laço de tamanho variável — o que as regras dos hooks
// proíbem. Um componente por campo resolve: cada instância faz a sua chamada, e
// montar/desmontar ao trocar de aba é o caminho normal do React.
//
// Continua sem falar HTTP: usa a query do domínio, como manda o ARQUITETURA.md.

interface ReferenceSelectProps {
  rota: string;
  filtroTipo?: string;
  valor: string;
  obrigatorio?: boolean;
  /** Some da lista: uma localização não pode ser o próprio pai. */
  excluirId?: string;
  onChange: (valor: string) => void;
}

export default function ReferenceSelect({
  rota, filtroTipo, valor, obrigatorio, excluirId, onChange,
}: ReferenceSelectProps) {
  const { data, isPending } = useCatalogOptionsQuery(rota, filtroTipo);
  const opcoes = (data ?? []).filter((opcao) => opcao.id !== excluirId);

  // O `/options` tem teto de 200 (list-catalog-options.usecase.ts). Passando
  // disso, o vínculo atual pode não estar na lista — e um `<select>` cujo
  // `value` não casa com nenhuma `<option>` renderiza VAZIO. Salvar daí mandaria
  // `''`, que em `parentId`/`managerId`/`locationId` vira `null`: o vínculo
  // sumiria sem o usuário ter tocado no campo.
  //
  // A opção abaixo segura o valor para que isso não aconteça. Ela não resolve
  // navegar acima de 200 itens — isso pede um seletor com busca, que é outra
  // conversa —, mas troca perda silenciosa por um campo que se explica.
  const foraDaLista = !isPending && valor !== '' && !opcoes.some((opcao) => opcao.id === valor);

  return (
    <select
      required={obrigatorio}
      value={valor}
      onChange={(event) => onChange(event.target.value)}
      className="w-full p-2 bg-bg-base border border-border-sutil text-text-primary focus:outline-none focus:border-text-secondary transition-colors disabled:opacity-50"
      disabled={isPending}
    >
      <option value="">{isPending ? 'Carregando...' : obrigatorio ? 'Selecione...' : '— nenhum —'}</option>
      {foraDaLista && <option value={valor}>— vínculo atual (fora das {opcoes.length} primeiras opções) —</option>}
      {opcoes.map((opcao) => (
        <option key={opcao.id} value={opcao.id}>{opcao.name}</option>
      ))}
    </select>
  );
}
