import type { ComponentProps } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '../../helpers/cn.helper';
import { naoFecharPelaNotificacao } from './fora-da-janela.helper';

export const Dialog = DialogPrimitive.Root;

export const CLASSE_DO_VEU =
  'fixed inset-0 z-50 bg-black/60 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0';

const LARGURAS = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-3xl' } as const;

interface DialogContentProps extends ComponentProps<typeof DialogPrimitive.Content> {
  largura?: keyof typeof LARGURAS;
}

export function DialogContent({ className, children, largura = 'lg', onInteractOutside, ...props }: DialogContentProps) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className={CLASSE_DO_VEU} />
      <DialogPrimitive.Content
        aria-describedby={undefined}
        onInteractOutside={(evento) => {
          naoFecharPelaNotificacao(evento);
          onInteractOutside?.(evento);
        }}
        className={cn(
          'fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg border border-border-sutil bg-surface-card shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
          LARGURAS[largura],
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close
          aria-label="Fechar"
          className="absolute right-4 top-4 rounded-sm text-text-tertiary transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="size-4" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogHeader({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('shrink-0 space-y-1.5 border-b border-border-sutil p-6 pr-12', className)} {...props} />;
}

export function DialogTitle({ className, ...props }: ComponentProps<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title className={cn('break-words text-lg font-semibold leading-tight text-text-primary', className)} {...props} />;
}

export function DialogDescription({ className, ...props }: ComponentProps<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description className={cn('text-sm text-text-tertiary', className)} {...props} />;
}
