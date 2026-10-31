import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
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
    <div className="flex flex-wrap items-center justify-between gap-4 mb-4 font-mono text-xs">
      {view && onViewChange && (
        <div className="flex border border-border-sutil">
          {ABAS_DA_LIXEIRA.map(aba => (
            <button
              key={aba.valor}
              type="button"
              onClick={() => onViewChange(aba.valor)}
              className={`px-4 py-2 uppercase tracking-widest transition-colors ${
                view === aba.valor
                  ? 'bg-text-primary text-bg-base'
                  : 'text-text-tertiary hover:text-text-primary hover:bg-bg-base'
              }`}
            >
              {aba.rotulo}
            </button>
          ))}
        </div>
      )}

      {/* Busca e filtros num grupo só: soltos, o `justify-between` da barra
          espalharia o filtro no meio do caminho entre a busca e a paginação. */}
      {(onSearchChange || filtros) && (
        <div className="flex flex-1 flex-wrap items-center gap-2">
          {onSearchChange && (
            <div className="relative flex-1 min-w-[220px] max-w-sm">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none" />
              <input
                type="search"
                value={search ?? ''}
                onChange={event => onSearchChange(event.target.value)}
                placeholder={placeholder}
                className="w-full pl-9 pr-3 py-2 bg-surface-card border border-border-sutil text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-text-secondary transition-colors"
              />
            </div>
          )}
          {filtros}
        </div>
      )}

      <div className="flex items-center gap-4">
        <span className="text-text-tertiary tabular-nums">
          {primeiro}–{ultimo} de {total}
        </span>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            aria-label="Página anterior"
            className="p-2 border border-border-sutil text-text-secondary hover:text-text-primary hover:bg-bg-base disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft size={14} />
          </button>

          <span className="px-3 text-text-secondary tabular-nums">
            {page} / {totalPages}
          </span>

          <button
            type="button"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            aria-label="Próxima página"
            className="p-2 border border-border-sutil text-text-secondary hover:text-text-primary hover:bg-bg-base disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
