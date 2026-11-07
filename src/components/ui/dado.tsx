import type { ReactNode } from 'react';
import { cn } from '../../helpers/cn.helper';

// UM DADO DA FICHA: o rótulo em cima, o valor embaixo. O campo vazio não aparece
// — uma coluna de "—" faz a ficha parecer quebrada, e o Editar mostra o que falta.

const vazio = (valor: ReactNode) => valor === null || valor === undefined || valor === '' || valor === '—' || valor === false;

export function Dado({ rotulo, children, largo = false }: { rotulo: string; children: ReactNode; largo?: boolean }) {
  if (vazio(children)) return null;
  return (
    <div className={cn('min-w-0 space-y-1', largo && 'col-span-full')}>
      <dt className="text-xs font-medium text-text-tertiary">{rotulo}</dt>
      <dd className="whitespace-pre-wrap break-words text-sm text-text-primary">{children}</dd>
    </div>
  );
}

/** Um grupo de campos: começa sempre na primeira coluna, e o campo vazio não deixa buraco. */
export function GrupoDeDados({ children }: { children: ReactNode }) {
  return <div className="contents [&>:first-child]:col-start-1">{children}</div>;
}

export function GradeDeDados({ children, className }: { children: ReactNode; className?: string }) {
  return <dl className={cn('grid grid-cols-2 gap-4 md:grid-cols-3', className)}>{children}</dl>;
}
