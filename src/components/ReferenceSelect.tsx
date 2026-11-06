import { useState } from 'react';
import { useCatalogOptionsQuery } from '../queries/catalog.queries';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { Seletor } from './ui/seletor';

// Seletor alimentado por outra tabela (/options).
//
// É o ÚNICO componente desta pasta que busca dado, e por um motivo concreto: a
// quantidade de campos-referência muda de aba para aba (Modelos tem dois,
// Fabricantes nenhum). Buscar no hook da página exigiria chamar um hook por
// campo dentro de um laço de tamanho variável — o que as regras dos hooks
// proíbem. Um componente por campo resolve: cada instância faz a sua chamada, e
// montar/desmontar ao trocar de aba é o caminho normal do React.
//
// Continua sem falar HTTP: usa a query do domínio, como manda o docs/referencia/arquitetura.md.

/**
 * O TETO DO `/options` NO SERVIDOR, repetido aqui de propósito.
 *
 * O número mora em `server/modules/catalog/use-cases/list-catalog-options.usecase.ts`
 * (e nos dois irmãos, de ativos e de usuários). O lint impede `src/` importar de
 * `server/`, e a regra existe para o Prisma não acabar no bundle — não vale
 * furá-la por um número (é o D71 outra vez).
 *
 * A divergência é inofensiva aqui: o número só decide quando aparece o aviso de
 * que a lista foi cortada.
 */
const TETO_DE_OPCOES = 200;

interface ReferenceSelectProps {
  rota: string;
  filtroTipo?: string;
  /** Recorte próprio da rota, além do tipo: `{ maquina: 'sem' }` nos ativos. */
  parametros?: Record<string, string>;
  valor: string;
  obrigatorio?: boolean;
  /**
   * Somem da lista — quando a regra recusa alguns de uma vez: os status
   * `DEPLOYABLE` como destino de uma entrega. O `/options` só
   * filtra por UM tipo, e não por "todos menos um"; quem sabe os ids a tirar
   * é quem usa o campo.
   */
  excluirIds?: readonly string[];
  /**
   * O vínculo com que o formulário ABRIU, com o nome — o que o registro já traz
   * embutido (`asset.location`, `model.manufacturer`). Serve só para dar nome à
   * opção "fora desta lista"; sem ele, ela aparece sem nome, como antes.
   */
  atual?: { id: string; name: string } | null;
  /**
   * Mostra o `detalhe` da opção ao lado do nome — "Laura Souza — laura@empresa.com".
   * Onde a tela pediu; nas outras o seletor continua só com o nome.
   */
  comDetalhe?: boolean;
  onChange: (valor: string) => void;
}

export default function ReferenceSelect({
  rota, filtroTipo, parametros, valor, obrigatorio, excluirIds, atual, comDetalhe = false, onChange,
}: ReferenceSelectProps) {
  const [busca, setBusca] = useState('');
  // A última opção ESCOLHIDA aqui, com o nome. É o outro caminho para o valor
  // ficar fora da lista: escolher "Dell" e depois buscar "HP". Sem guardar o
  // nome na hora da escolha, a opção órfã levaria o nome do `atual` — que é o
  // vínculo de ANTES, não o escolhido.
  const [escolhida, setEscolhida] = useState<{ id: string; name: string } | null>(null);
  // O MESMO `useDebouncedValue` das cinco listagens: sem ele é uma requisição
  // por tecla, e o `/options` não tem paginação para amortecer.
  const buscaDebounced = useDebouncedValue(busca);

  const { data, isPending, isError } = useCatalogOptionsQuery(rota, filtroTipo, buscaDebounced || undefined, parametros);
  const opcoes = (data ?? []).filter((opcao) => !excluirIds?.includes(opcao.id));

  // O `/options` tem teto de 200 (list-catalog-options.usecase.ts). Passando
  // disso, o vínculo atual pode não estar na lista — e, enquanto há termo digitado,
  // costuma estar fora da lista filtrada. A opção abaixo segura o valor: sem ela o
  // campo apareceria vazio, e salvar daí mandaria `''`, que em
  // `locationId`/`manufacturerId` vira `null`: o vínculo sumiria sem o usuário ter
  // tocado no campo.
  const foraDaLista = !isPending && valor !== '' && !opcoes.some((opcao) => opcao.id === valor);
  // O nome, quando se sabe SEM requisição: pelo id, nunca por posição — um
  // nome trocado aqui faria a pessoa salvar achando que é outro vínculo. Além do
  // teto, é o caso do colaborador DESATIVADO, que o `/options` não devolve e o
  // registro continua apontando.
  const nomeForaDaLista = [escolhida, atual].find((ref) => ref?.id === valor)?.name;

  const listaCheia = opcoes.length >= TETO_DE_OPCOES;

  return (
    <Seletor
      value={valor}
      onChange={(id) => {
        const opcao = opcoes.find((item) => item.id === id);
        setEscolhida(opcao ? { id: opcao.id, name: opcao.name } : null);
        onChange(id);
      }}
      obrigatorio={obrigatorio}
      // `isPending` é só a PRIMEIRA carga: com `placeholderData` na query, as
      // buscas seguintes mantêm a lista anterior e o campo não trava a cada tecla.
      disabled={isPending}
      vazio={isPending ? 'Carregando…' : isError ? 'Não foi possível carregar' : obrigatorio ? 'Selecione…' : 'Nenhum'}
      comOpcaoVazia={!obrigatorio}
      onBusca={setBusca}
      busca={busca}
      rodape={listaCheia ? `Mostrando as ${TETO_DE_OPCOES} primeiras. Use a busca para achar o resto.` : undefined}
      opcoes={[
        ...(foraDaLista
          ? [{ value: valor, label: nomeForaDaLista ? `${nomeForaDaLista} (fora desta lista)` : 'Vínculo atual (fora desta lista)' }]
          : []),
        ...opcoes.map((opcao) => ({
          value: opcao.id,
          label: opcao.name,
          detalhe: comDetalhe ? opcao.detalhe ?? undefined : undefined,
        })),
      ]}
    />
  );
}
