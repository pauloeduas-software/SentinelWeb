import { useState } from 'react';
import { Command } from 'cmdk';
import { Check, ChevronsUpDown, Search } from 'lucide-react';
import { cn } from '../../helpers/cn.helper';
import { Popover, PopoverContent, PopoverTrigger } from './popover';
import { CLASSE_DO_CONTROLE } from './input';
import { useIdDoCampo } from './campo';

// O SELETOR COM BUSCA — filtros e campos de escolha, no lugar do `<select>` do
// navegador. É o `SearchableSelect` da IntraNet.
//
// `required` num botão não existe: o `<select>` escondido é quem segura a
// validação do formulário, e o balão do navegador aparece aqui em vez de o envio
// passar com o campo vazio. Nele o `invalid` chega ao `validacaoEmPortugues`.
//
// `modal` no Popover porque o seletor mora dentro de janelas: sem ele, a trava de
// rolagem da janela engole a roda do mouse na lista, que está num portal.

export interface OpcaoDoSeletor {
  value: string;
  label: string;
  /** O texto ao lado: e-mail, descrição. Entra também na busca. */
  detalhe?: string;
}

interface SeletorProps {
  id?: string;
  value: string;
  onChange: (valor: string) => void;
  opcoes: readonly OpcaoDoSeletor[];
  /** O que o botão diz com `value` vazio — também o nome de "todas" e "nenhum". */
  vazio: string;
  /** Oferece a linha que volta para `value` vazio: "Todas as categorias", "— nenhum —". */
  comOpcaoVazia?: boolean;
  placeholderDaBusca?: string;
  obrigatorio?: boolean;
  disabled?: boolean;
  /** Sem rótulo visível, o nome para o leitor de tela: os filtros da barra. */
  ariaLabel?: string;
  className?: string;
  /** As opções em fonte mono: chave. A lista abre num portal, e não herda a do botão. */
  opcoesMono?: boolean;
  /** Busca no servidor: a lista já chega filtrada, e o `cmdk` não filtra de novo. */
  onBusca?: (termo: string) => void;
  busca?: string;
  /** A linha embaixo da lista: "Mostrando as 200 primeiras." */
  rodape?: string;
}

export function Seletor({
  id, value, onChange, opcoes, vazio, comOpcaoVazia = false, placeholderDaBusca = 'Buscar…',
  obrigatorio, disabled, ariaLabel, className, opcoesMono = false, onBusca, busca, rodape,
}: SeletorProps) {
  const [aberto, setAberto] = useState(false);
  const idDoCampo = useIdDoCampo(id);
  const selecionada = opcoes.find((opcao) => opcao.value === value);

  const escolher = (valor: string) => {
    onChange(valor);
    setAberto(false);
  };

  return (
    <div className={cn('relative', className)}>
      {obrigatorio && (
        <select
          aria-hidden="true"
          tabIndex={-1}
          required
          value={value}
          onChange={() => undefined}
          className="pointer-events-none absolute inset-x-0 bottom-0 h-px w-full opacity-0"
        >
          <option value="" />
          {value && <option value={value} />}
        </select>
      )}
      <Popover open={aberto} onOpenChange={setAberto} modal>
        <PopoverTrigger asChild>
          <button
            id={idDoCampo}
            type="button"
            role="combobox"
            aria-expanded={aberto}
            aria-label={ariaLabel}
            disabled={disabled}
            className={cn(CLASSE_DO_CONTROLE, 'h-10 items-center justify-between gap-2 text-left')}
          >
            <span className={cn('truncate', !selecionada && 'text-text-tertiary')}>
              {selecionada?.label ?? vazio}
            </span>
            <ChevronsUpDown className="size-4 shrink-0 text-text-tertiary" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-[max(var(--radix-popover-trigger-width),16rem)] p-0">
          <Command shouldFilter={!onBusca} className="flex flex-col">
            <div className="flex items-center gap-2 border-b border-border-sutil px-3">
              <Search className="size-4 shrink-0 text-text-tertiary" />
              <Command.Input
                value={onBusca ? (busca ?? '') : undefined}
                onValueChange={onBusca}
                placeholder={placeholderDaBusca}
                className="h-10 w-full bg-transparent text-sm text-text-primary outline-none placeholder:text-text-tertiary"
              />
            </div>
            <Command.List className="max-h-64 overflow-y-auto p-1">
              <Command.Empty className="px-2 py-4 text-center text-sm text-text-tertiary">Nada encontrado.</Command.Empty>
              {comOpcaoVazia && <Item rotulo={vazio} selecionado={value === ''} onSelect={() => escolher('')} />}
              {opcoes.map((opcao) => (
                <Item
                  key={opcao.value}
                  rotulo={opcao.label}
                  detalhe={opcao.detalhe}
                  mono={opcoesMono}
                  selecionado={opcao.value === value}
                  onSelect={() => escolher(opcao.value)}
                />
              ))}
            </Command.List>
            {rodape && <p className="border-t border-border-sutil px-3 py-2 text-xs text-text-tertiary">{rodape}</p>}
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function Item({ rotulo, detalhe, mono = false, selecionado, onSelect }: {
  rotulo: string;
  detalhe?: string;
  mono?: boolean;
  selecionado: boolean;
  onSelect: () => void;
}) {
  return (
    <Command.Item
      value={`${rotulo} ${detalhe ?? ''}`}
      onSelect={onSelect}
      className="flex cursor-pointer select-none items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-sm outline-none data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
    >
      <span className="min-w-0 truncate">
        <span className={mono ? 'font-mono' : undefined}>{rotulo}</span>
        {detalhe && <span className="text-text-tertiary"> · {detalhe}</span>}
      </span>
      {selecionado && <Check className="size-4 shrink-0 text-primary" />}
    </Command.Item>
  );
}
