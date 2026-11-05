import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Segmentado } from './ui/segmentado';
import type { ListView } from '../types/list.types';

// Busca e paginação das listagens. Compartilhado por todas elas para as telas
// não divergirem — é apresentacional puro: recebe valor e callback, não
// conhece query nem HTTP.

/** As abas: a listagem e a lixeira — a única tela com abas aqui é a do colaborador. */
const ABAS_DA_LIXEIRA: readonly { valor: ListView; rotulo: string }[] = [
  { valor: 'active', rotulo: 'Ativos' },
  { valor: 'trashed', rotulo: 'Lixeira' },
];

interface ListToolbarProps {
  /** Omitido nas listagens sem abas: elas simplesmente não aparecem. */
  view?: ListView;
  onViewChange?: (view: ListView) => void;
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
  page: number;
  perPage: number;
  total: number;
  onPageChange: (page: number) => void;
}

export default function ListToolbar({
  view,
  onViewChange,
  search,
  onSearchChange,
  placeholder,
  filtros,
  page,
  perPage,
  total,
  onPageChange,
}: ListToolbarProps) {
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const primeiro = total === 0 ? 0 : (page - 1) * perPage + 1;
  const ultimo = Math.min(page * perPage, total);

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      {view && onViewChange && <Segmentado opcoes={ABAS_DA_LIXEIRA} valor={view} onChange={onViewChange} />}

      {/* Busca e filtros num grupo só: soltos, o `justify-between` da barra
          espalharia o filtro no meio do caminho entre a busca e a paginação. */}
      {(onSearchChange || filtros) && (
        <div className="flex min-w-0 grow basis-full flex-wrap items-center gap-2 sm:basis-0">
          {onSearchChange && (
            <div className="relative min-w-[220px] max-w-md flex-1">
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

      <div className="ml-auto flex items-center gap-3 text-sm">
        <span className="tabular-nums text-text-tertiary">
          {primeiro}–{ultimo} de {total}
        </span>

        <div className="flex items-center gap-1">
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
      </div>
    </div>
  );
}
