import { ChevronDown, LogOut, UserRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import MenuDoTema from './MenuDoTema';
import { Avatar } from './ui/avatar';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { nomeDoCargo } from '../helpers/cargo.helper';
import { useAuthStore } from '../stores/auth.store';

// QUEM ESTÁ OPERANDO, no cabeçalho. Num computador compartilhado é o que diz em
// nome de quem se está clicando; aqui ficam também o tema, a conta e o Sair.
export default function MenuDoUsuario() {
  const usuario = useAuthStore((estado) => estado.usuario);
  const sair = useAuthStore((estado) => estado.sair);
  if (!usuario) return null;

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        aria-label="Menu do usuário"
        title={usuario.name}
        className="group flex h-10 items-center gap-2 rounded-xl px-2 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Avatar nome={usuario.name} className="size-8 text-xs" />
        <ChevronDown className="size-4 text-text-tertiary transition-transform group-data-[state=open]:rotate-180" />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" sideOffset={8} className="w-72 p-2">
        <div className="mb-2 space-y-1 rounded-lg bg-accent/50 p-3">
          <p className="truncate text-sm font-semibold text-text-primary">{usuario.name}</p>
          <p className="text-xs font-medium text-text-tertiary">{nomeDoCargo(usuario.role)}</p>
          {usuario.email && <p className="truncate text-xs text-text-tertiary">{usuario.email}</p>}
        </div>

        <MenuDoTema className="mb-1 flex w-full justify-between [&>button]:flex-1 [&>button]:justify-center" />

        <DropdownMenuItem asChild>
          <Link to="/conta"><UserRound /> Minha conta</Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => void sair()}
          className="text-status-danger focus:bg-status-danger/10 focus:text-status-danger"
        >
          <LogOut /> Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
