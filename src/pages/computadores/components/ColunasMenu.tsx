import { Check, Columns3, RotateCcw } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuItemIndicator,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '../../../components/ui/dropdown-menu';
import type { ColunaDeAtivo } from '../helpers/asset-columns';

// O MENU DE COLUNAS (F10, Etapa B).
//
// Dropdown e não modal: a escolha é de uma linha e o resultado aparece atrás —
// um modal cobriria justamente a tabela que a pessoa está ajustando.
//
// A preferência é do NAVEGADOR (`asset.store.ts`), e o texto no pé do menu diz
// isso. Sem a frase, a primeira suposição de quem usa duas máquinas é que a
// escolha some sozinha.

interface Props {
  catalogo: readonly ColunaDeAtivo[];
  visiveis: readonly string[];
  personalizado: boolean;
  onAlternar: (token: string) => void;
  onRestaurar: () => void;
}

export default function ColunasMenu({
  catalogo, visiveis, personalizado, onAlternar, onRestaurar,
}: Props) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" title="Escolher colunas">
          <Columns3 /> Colunas
          <span className="tabular-nums text-text-tertiary">{visiveis.length}</span>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-64">
        {catalogo.map((coluna) => (
          <DropdownMenuCheckboxItem
            key={coluna.token}
            checked={visiveis.includes(coluna.token)}
            disabled={coluna.fixa}
            onCheckedChange={() => onAlternar(coluna.token)}
            // O menu fica aberto: quem ajusta a tabela costuma marcar mais de uma.
            onSelect={(evento) => evento.preventDefault()}
            title={coluna.fixa ? 'A etiqueta identifica a linha e não pode ser escondida.' : undefined}
            // A travada recebe o ponteiro, senão o `title` acima nunca aparece.
            className={coluna.fixa ? 'cursor-not-allowed data-[disabled]:pointer-events-auto' : undefined}
          >
            <span className="flex size-4 items-center justify-center">
              <DropdownMenuItemIndicator><Check /></DropdownMenuItemIndicator>
            </span>
            {coluna.rotulo}
          </DropdownMenuCheckboxItem>
        ))}

        <DropdownMenuSeparator />

        <DropdownMenuItem
          disabled={!personalizado}
          onSelect={(evento) => {
            evento.preventDefault();
            onRestaurar();
          }}
        >
          <RotateCcw /> Restaurar padrão
        </DropdownMenuItem>
        <p className="px-2 py-1.5 text-xs text-text-tertiary">A escolha vale só neste navegador.</p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
