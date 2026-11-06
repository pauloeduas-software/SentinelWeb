import type { ComponentProps } from 'react';
import { cn } from '../../helpers/cn.helper';

const TONS = {
  perigo: 'border-status-danger/30 bg-status-danger/10 text-status-danger',
  aviso: 'border-status-warning/30 bg-status-warning/10 text-status-warning',
  info: 'border-status-info/30 bg-status-info/10 text-status-info',
} as const;

interface AvisoProps extends ComponentProps<'div'> {
  tom?: keyof typeof TONS;
  /** O recado que quem leu pode tirar da frente: a recusa de uma ação, o link que falhou. */
  onDispensar?: () => void;
}

/** A faixa de recado: o erro do formulário, o alerta de prazo. */
export function Aviso({ className, tom = 'perigo', onDispensar, children, ...props }: AvisoProps) {
  return (
    <div
      role={tom === 'perigo' ? 'alert' : undefined}
      className={cn('rounded-md border p-3 text-sm', onDispensar && 'flex items-start justify-between gap-4', TONS[tom], className)}
      {...props}
    >
      {onDispensar ? <span>{children}</span> : children}
      {onDispensar && (
        <button type="button" onClick={onDispensar} className="shrink-0 text-xs hover:underline focus-visible:underline focus-visible:outline-none">
          Dispensar
        </button>
      )}
    </div>
  );
}
