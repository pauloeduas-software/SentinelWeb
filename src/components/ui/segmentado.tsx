import type { ReactNode } from 'react';
import { cn } from '../../helpers/cn.helper';

// A ESCOLHA ENTRE POUCAS OPÇÕES VISÍVEIS: Ativos e Lixeira, Colaborador e Posto.
// Tem a cara das abas, sem ser aba: troca o recorte, não o painel. `sublinhado` é
// para o topo de uma lista; o bloco, para dentro de formulário e menu.

interface OpcaoSegmentada<T> {
  valor: T;
  rotulo: ReactNode;
}

interface SegmentadoProps<T> {
  opcoes: readonly OpcaoSegmentada<T>[];
  valor: T;
  onChange: (valor: T) => void;
  sublinhado?: boolean;
  className?: string;
}

export function Segmentado<T extends string | undefined>({ opcoes, valor, onChange, sublinhado, className }: SegmentadoProps<T>) {
  return (
    <div
      className={cn(
        'max-w-full items-center overflow-x-auto',
        sublinhado ? 'flex gap-6' : 'inline-flex w-fit gap-1 rounded-md bg-surface-muted p-1',
        className,
      )}
    >
      {opcoes.map((opcao) => {
        const escolhida = valor === opcao.valor;
        return (
          <button
            key={opcao.valor ?? 'todos'}
            type="button"
            aria-pressed={escolhida}
            onClick={() => onChange(opcao.valor)}
            className={cn(
              'inline-flex items-center gap-2 whitespace-nowrap text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-4',
              sublinhado ? 'border-b-2 py-2.5 focus-visible:ring-inset' : 'rounded-sm px-3 py-1.5',
              escolhida && sublinhado && 'border-primary text-text-primary',
              escolhida && !sublinhado && 'bg-surface-card text-text-primary shadow-sm',
              !escolhida && 'text-text-secondary hover:text-text-primary',
              !escolhida && sublinhado && 'border-transparent',
            )}
          >
            {opcao.rotulo}
          </button>
        );
      })}
    </div>
  );
}
