import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import type { ListView } from '../../domain/shared/list.types';

// Busca e paginação das listagens. Compartilhado entre Inventário e Usuários
// para as duas telas não divergirem — é apresentacional puro: recebe valor e
// callback, não conhece query nem HTTP.

interface ListToolbarProps {
  /** Omitido nas listagens sem lixeira: a aba simplesmente não aparece. */
  view?: ListView;
  onViewChange?: (view: ListView) => void;
  search: string;
  onSearchChange: (value: string) => void;
  placeholder: string;
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
  page,
  perPage,
  total,
  onPageChange,
}: ListToolbarProps) {
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const primeiro = total === 0 ? 0 : (page - 1) * perPage + 1;
  const ultimo = Math.min(page * perPage, total);

  const abas: { valor: ListView; rotulo: string }[] = [
    { valor: 'active', rotulo: 'Ativos' },
    { valor: 'trashed', rotulo: 'Lixeira' },
  ];

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 mb-4 font-mono text-xs">
      {view && onViewChange && (
        <div className="flex border border-border-sutil">
          {abas.map(aba => (
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

      <div className="relative flex-1 min-w-[220px] max-w-sm">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none" />
        <input
          type="search"
          value={search}
          onChange={event => onSearchChange(event.target.value)}
          placeholder={placeholder}
          className="w-full pl-9 pr-3 py-2 bg-surface-card border border-border-sutil text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-text-secondary transition-colors"
        />
      </div>

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
