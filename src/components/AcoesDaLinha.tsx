import { MoreHorizontal, type LucideIcon } from 'lucide-react';
import { Button } from './ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from './ui/dropdown-menu';

// O MENU `⋯` — as ações de um registro, na linha da tabela e no card da ficha.
//
// A ordem é a do sistema: Editar, Desativar/Ativar, Excluir, e o que destrói fica
// por último, depois de um traço. A linha é clicável, por isso o `stopPropagation`:
// o clique no menu, portal incluído, não pode abrir o registro por baixo.
//
// `modal={false}`: o item costuma abrir uma janela, e o menu modal disputaria com
// ela o `pointer-events` do <body>, que ficaria travado depois de fechar as duas.

export interface AcaoDaLinha {
  rotulo: string;
  icone: LucideIcon;
  onClick: () => void;
  disabled?: boolean;
  /** Por que está desativada: "Sem unidade disponível". */
  titulo?: string;
  perigo?: boolean;
}

interface AcoesDaLinhaProps {
  /** O nome do registro, para o leitor de tela: "Ações de Mouse USB". */
  nome: string;
  acoes: readonly (AcaoDaLinha | false | null | undefined)[];
}

export default function AcoesDaLinha({ nome, acoes }: AcoesDaLinhaProps) {
  const visiveis = acoes.filter((acao): acao is AcaoDaLinha => Boolean(acao));
  if (visiveis.length === 0) return null;
  const comuns = visiveis.filter((acao) => !acao.perigo);
  const perigosas = visiveis.filter((acao) => acao.perigo);

  return (
    <div onClick={(evento) => evento.stopPropagation()} className="flex justify-end">
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Ações de ${nome}`} title="Ações">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {comuns.map((acao) => <Item key={acao.rotulo} acao={acao} />)}
          {comuns.length > 0 && perigosas.length > 0 && <DropdownMenuSeparator />}
          {perigosas.map((acao) => <Item key={acao.rotulo} acao={acao} />)}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function Item({ acao }: { acao: AcaoDaLinha }) {
  const Icone = acao.icone;
  return (
    <DropdownMenuItem
      onSelect={acao.onClick}
      disabled={acao.disabled}
      title={acao.titulo}
      className={acao.perigo ? 'text-status-danger focus:bg-status-danger/10 focus:text-status-danger' : undefined}
    >
      <Icone /> {acao.rotulo}
    </DropdownMenuItem>
  );
}
