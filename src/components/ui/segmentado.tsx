import type { ReactNode } from 'react';
import { cn } from '../../helpers/cn.helper';

// A ESCOLHA ENTRE POUCAS OPÇÕES VISÍVEIS: Ativos e Lixeira, Colaborador e Posto.
// Tem a cara das abas, sem ser aba: troca o recorte, não o painel.

interface OpcaoSegmentada<T> {
  valor: T;
  rotulo: ReactNode;
}

interface SegmentadoProps<T> {
  opcoes: readonly OpcaoSegmentada<T>[];
  valor: T;
  onChange: (valor: T) => void;
  className?: string;
}

export function Segmentado<T extends string | undefined>({ opcoes, valor, onChange, className }: SegmentadoProps<T>) {
  return (
    <div className={cn('inline-flex w-fit max-w-full items-center gap-1 overflow-x-auto rounded-md bg-surface-muted p-1', className)}>
      {opcoes.map((opcao) => (
        <button
          key={opcao.valor ?? 'todos'}
          type="button"
          aria-pressed={valor === opcao.valor}
          onClick={() => onChange(opcao.valor)}
          className={cn(
            'inline-flex items-center gap-2 whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-4',
            valor === opcao.valor
              ? 'bg-surface-card text-text-primary shadow-sm'
              : 'text-text-tertiary hover:text-text-primary',
          )}
        >
          {opcao.rotulo}
        </button>
      ))}
    </div>
  );
}
