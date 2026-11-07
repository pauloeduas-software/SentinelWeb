import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { cn } from '../helpers/cn.helper';

// Busca, filtros, paginação e o botão da tela, nessa ordem e iguais em toda lista
// (BB). As vistas moram em `VistasDaLista` e o status, em `CartoesDeContagem`.
// Apresentacional puro: recebe valor e callback, não conhece query nem HTTP.

interface ListToolbarProps {
  /**
   * Omitidos onde não há o que buscar, e aí o campo não aparece — é a mesma
   * opcionalidade que a aba de lixeira já tinha. Hoje toda listagem que usa a
   * barra tem busca; um campo inerte prometeria uma função que não existe.
   */
  search?: string;
  onSearchChange?: (value: string) => void;
  placeholder?: string;
  /** Filtros da tela, ao lado da busca — o de categoria, por exemplo. */
  filtros?: ReactNode;
  /** O botão da tela, depois da paginação: "Novo posto". */
  acao?: ReactNode;
  page: number;
  perPage: number;
  total: number;
  onPageChange: (page: number) => void;
}

export default function ListToolbar({
  search,
  onSearchChange,
  placeholder,
  filtros,
  acao,
  page,
  perPage,
  total,
  onPageChange,
}: ListToolbarProps) {
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const primeiro = total === 0 ? 0 : (page - 1) * perPage + 1;
  const ultimo = Math.min(page * perPage, total);
  // `page` junto porque excluir o último da página 2 deixa uma página só com a lista
  // ainda na 2, e sem as setas não haveria como voltar.
  const umaPagina = totalPages === 1 && page === 1;

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      {/* Busca e filtros num grupo só: soltos, o `justify-between` da barra
          espalharia o filtro no meio do caminho entre a busca e a paginação. */}
      {(onSearchChange || filtros) && (
        <div className="flex min-w-0 grow basis-full flex-wrap items-center gap-2 sm:basis-0">
          {onSearchChange && (
            <div className="relative min-w-[14rem] max-w-md flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-tertiary" />
              <Input
                type="search"
                value={search ?? ''}
                onChange={event => onSearchChange(event.target.value)}
                placeholder={placeholder}
                className="bg-surface-card pl-9"
              />
            </div>
          )}
          {filtros}
        </div>
      )}

      {/* `invisible`, e não fora da árvore: o que não tem o que mostrar some, mas guarda
          o lugar, e filtrar não faz a busca nem o botão andarem. */}
      <div className="ml-auto flex items-center gap-3 text-sm">
        <span className={cn('tabular-nums text-text-tertiary', total === 0 && 'invisible')}>
          {primeiro}–{ultimo} de {total}
        </span>

        <div className={cn('flex items-center gap-1', umaPagina && 'invisible')}>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            aria-label="Página anterior"
          >
            <ChevronLeft />
          </Button>

          <span className="px-2 tabular-nums text-text-secondary">
            {page} / {totalPages}
          </span>

          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            aria-label="Próxima página"
          >
            <ChevronRight />
          </Button>
        </div>

        {acao}
      </div>
    </div>
  );
}
