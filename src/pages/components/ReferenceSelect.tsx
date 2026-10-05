import { useState } from 'react';
import { Search } from 'lucide-react';
import { useCatalogOptionsQuery } from '../../domain/catalog/catalog.queries';
import { useDebouncedValue } from '../hooks/useDebouncedValue';

// `<select>` alimentado por outra tabela (/options).
//
// É o ÚNICO componente desta pasta que busca dado, e por um motivo concreto: a
// quantidade de campos-referência muda de aba para aba (Modelos tem dois,
// Fornecedores nenhum). Buscar no hook da página exigiria chamar um hook por
// campo dentro de um laço de tamanho variável — o que as regras dos hooks
// proíbem. Um componente por campo resolve: cada instância faz a sua chamada, e
// montar/desmontar ao trocar de aba é o caminho normal do React.
//
// Continua sem falar HTTP: usa a query do domínio, como manda o docs/referencia/arquitetura.md.

/**
 * O TETO DO `/options` NO SERVIDOR, repetido aqui de propósito.
 *
 * O número mora em `server/domain/catalog/use-cases/list-catalog-options.usecase.ts`
 * (e nos dois irmãos, de ativos e de usuários). O lint impede `src/` importar de
 * `server/`, e a regra existe para o Prisma não acabar no bundle — não vale
 * furá-la por um número (é o D71 outra vez).
 *
 * A divergência é inofensiva aqui: se o servidor baixar o teto, a lista chega
 * menor que isto e o campo de busca deixa de aparecer sozinho; se subir, ele
 * aparece um pouco antes do necessário. Nenhum dos dois esconde opção nenhuma.
 */
const TETO_DE_OPCOES = 200;

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
  const [busca, setBusca] = useState('');
  // O MESMO `useDebouncedValue` das cinco listagens: sem ele é uma requisição
  // por tecla, e o `/options` não tem paginação para amortecer.
  const buscaDebounced = useDebouncedValue(busca);

  const { data, isPending } = useCatalogOptionsQuery(rota, filtroTipo, buscaDebounced || undefined);
  const opcoes = (data ?? []).filter((opcao) => opcao.id !== excluirId);

  // O `/options` tem teto de 200 (list-catalog-options.usecase.ts). Passando
  // disso, o vínculo atual pode não estar na lista — e um `<select>` cujo
  // `value` não casa com nenhuma `<option>` renderiza VAZIO. Salvar daí mandaria
  // `''`, que em `parentId`/`managerId`/`locationId` vira `null`: o vínculo
  // sumiria sem o usuário ter tocado no campo.
  //
  // A opção abaixo segura o valor para que isso não aconteça. Com a busca ela
  // deixou de ser a única defesa, mas continua necessária: enquanto há termo
  // digitado, o vínculo atual costuma estar FORA da lista filtrada.
  const foraDaLista = !isPending && valor !== '' && !opcoes.some((opcao) => opcao.id === valor);

  // ═══════════════════════════════════════════════════════════════════════════
  // A BUSCA APARECE QUANDO A LISTA ESTÁ CHEIA — não sempre (F10, Etapa B).
  //
  // Um campo de busca fixo em cada campo-referência poria quatro caixas extras
  // no formulário de ativo, três das quais com oito opções embaixo. Ele nasce
  // exatamente no caso que motivou a etapa: a lista voltou no teto, então há
  // (provavelmente) mais coisa do que a tela mostra, e navegar até a 201ª
  // localização é impossível sem digitar.
  //
  // Uma vez digitado algo, o campo FICA — senão a lista encolheria abaixo do
  // teto, a caixa desapareceria e o termo ficaria aplicado sem nada na tela
  // explicando por que faltam opções.
  // ═══════════════════════════════════════════════════════════════════════════
  const listaCheia = opcoes.length >= TETO_DE_OPCOES;
  const mostrarBusca = listaCheia || busca !== '';

  return (
    <div className="space-y-1">
      {mostrarBusca && (
        <div className="relative">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-text-tertiary" />
          <input
            type="text"
            value={busca}
            onChange={(evento) => setBusca(evento.target.value)}
            placeholder="Buscar…"
            // `search` e não `text` só no tipo não bastaria: o que importa é que
            // ENTER aqui não submeta o formulário em volta — o campo está dentro
            // de um `<form>`, e submeter ao buscar gravaria o registro no meio
            // da escolha.
            onKeyDown={(evento) => {
              if (evento.key === 'Enter') evento.preventDefault();
            }}
            className="w-full pl-7 pr-2 py-1.5 bg-bg-base border border-border-sutil text-[11px] text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-text-secondary transition-colors"
          />
        </div>
      )}

      <select
        required={obrigatorio}
        value={valor}
        onChange={(event) => onChange(event.target.value)}
        className="w-full p-2 bg-bg-base border border-border-sutil text-text-primary focus:outline-none focus:border-text-secondary transition-colors disabled:opacity-50"
        // `isPending` é só a PRIMEIRA carga: com `placeholderData` na query, as
        // buscas seguintes mantêm a lista anterior e o campo não trava a cada
        // tecla.
        disabled={isPending}
      >
        <option value="">{isPending ? 'Carregando...' : obrigatorio ? 'Selecione...' : '— nenhum —'}</option>
        {foraDaLista && <option value={valor}>— vínculo atual (fora desta lista) —</option>}
        {opcoes.map((opcao) => (
          <option key={opcao.id} value={opcao.id}>{opcao.name}</option>
        ))}
      </select>

      {listaCheia && (
        <span className="block text-[10px] text-text-tertiary leading-relaxed">
          Mostrando as {TETO_DE_OPCOES} primeiras. Use a busca para achar o resto.
        </span>
      )}
    </div>
  );
}
