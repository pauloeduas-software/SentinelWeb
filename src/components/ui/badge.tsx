import type { ComponentProps } from 'react';
import { cn } from '../../helpers/cn.helper';

// A marca de STATUS — ativo, desativado, vencido, online. A cor sai só dos
// tokens de status, e nunca de nome, categoria ou tipo de evento (AY).
const TONS = {
  neutro: 'border-border-sutil bg-surface-muted text-text-secondary',
  sucesso: 'border-status-success/30 bg-status-success/10 text-status-success',
  aviso: 'border-status-warning/30 bg-status-warning/10 text-status-warning',
  perigo: 'border-status-danger/30 bg-status-danger/10 text-status-danger',
  info: 'border-status-info/30 bg-status-info/10 text-status-info',
} as const;

interface BadgeProps extends ComponentProps<'span'> {
  tom?: keyof typeof TONS;
}

export function Badge({ className, tom = 'neutro', ...props }: BadgeProps) {
  return (
    <span
      className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium', TONS[tom], className)}
      {...props}
    />
  );
}

/**
 * O ponto com o texto ao lado: o STATUS do registro, a mesma peça na tabela, no
 * cartão e na ficha (BB). O `Badge` fica para o selo que não é status.
 */
export function PontoDeStatus({ tom, children }: { tom: 'sucesso' | 'aviso' | 'perigo' | 'info' | 'neutro'; children: React.ReactNode }) {
  const cor = { sucesso: 'bg-status-success', aviso: 'bg-status-warning', perigo: 'bg-status-danger', info: 'bg-status-info', neutro: 'bg-text-tertiary' }[tom];
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 align-top text-sm">
      <span aria-hidden="true" className={cn('size-2 shrink-0 rounded-full', cor)} />
      <span className="truncate">{children}</span>
    </span>
  );
}
