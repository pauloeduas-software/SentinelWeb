import type { ComponentProps } from 'react';
import { cn } from '../../helpers/cn.helper';

const TONS = {
  perigo: 'border-status-danger/30 bg-status-danger/10 text-status-danger',
  aviso: 'border-status-warning/30 bg-status-warning/10 text-status-warning',
} as const;

interface AvisoProps extends ComponentProps<'div'> {
  tom?: keyof typeof TONS;
}

/** A faixa de recado: o erro do formulário, o alerta de prazo. */
export function Aviso({ className, tom = 'perigo', ...props }: AvisoProps) {
  return (
    <div
      role={tom === 'perigo' ? 'alert' : undefined}
      className={cn('rounded-md border p-3 text-sm', TONS[tom], className)}
      {...props}
    />
  );
}
