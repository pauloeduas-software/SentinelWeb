import type { ComponentProps } from 'react';
import { PontoDeStatus } from './ui/badge';
import { cn } from '../helpers/cn.helper';

// OS CARTÕES DE CONTAGEM DE UMA LISTA: o primeiro é o Total, e depois um por
// situação. O número filtra: clicar liga o recorte, clicar de novo desliga, e o
// Total limpa.

export interface Contagem<T> {
  valor: T;
  rotulo: string;
  /** `undefined` enquanto a resposta não chega, ou se ela falhou: o cartão mostra "—", e não 0. */
  total: number | undefined;
  /** A cor do ponto, a mesma do selo da tabela. O Total não tem. */
  tom?: ComponentProps<typeof PontoDeStatus>['tom'];
}

interface CartoesDeContagemProps<T> {
  contagens: readonly Contagem<T>[];
  escolhido: T;
  onEscolher: (valor: T) => void;
}

export default function CartoesDeContagem<T extends string | undefined>({
  contagens, escolhido, onEscolher,
}: CartoesDeContagemProps<T>) {
  return (
    <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fit,minmax(9rem,1fr))]">
      {contagens.map(({ valor, rotulo, total, tom }, indice) => {
        const ehTotal = indice === 0;
        const marcado = !ehTotal && escolhido === valor;

        return (
          <button
            key={rotulo}
            type="button"
            onClick={() => onEscolher(valor)}
            title={ehTotal ? 'Ver todos' : `Filtrar por ${rotulo}`}
            aria-pressed={marcado}
            className={cn(
              'rounded-lg border bg-surface-card px-4 py-3 text-left shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              marcado ? 'border-primary' : 'border-border-sutil hover:border-border-hover',
              // No celular são duas colunas: com número ímpar, o Total ocupa a linha.
              ehTotal && contagens.length % 2 === 1 && 'col-span-2 sm:col-span-1',
            )}
          >
            <span className="block truncate text-sm text-text-tertiary">
              {tom ? <PontoDeStatus tom={tom}>{rotulo}</PontoDeStatus> : rotulo}
            </span>
            <span className="mt-1 block text-2xl font-bold tabular-nums text-text-primary">{total ?? '—'}</span>
          </button>
        );
      })}
    </div>
  );
}
