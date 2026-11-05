import type { ComponentProps } from 'react';
import * as SheetPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '../../helpers/cn.helper';
import { CLASSE_DO_VEU } from './dialog';

// O PAINEL LATERAL: a casa dos formulários, como na IntraNet. É o mesmo Dialog
// do Radix, encostado à direita. Quem o usa é o `FormularioLateral`.

export const Sheet = SheetPrimitive.Root;

const LARGURAS = { md: 'sm:max-w-md', lg: 'sm:max-w-xl', xl: 'sm:max-w-3xl' } as const;

interface SheetContentProps extends ComponentProps<typeof SheetPrimitive.Content> {
  largura?: keyof typeof LARGURAS;
}

export function SheetContent({ className, children, largura = 'md', ...props }: SheetContentProps) {
  return (
    <SheetPrimitive.Portal>
      <SheetPrimitive.Overlay className={CLASSE_DO_VEU} />
      <SheetPrimitive.Content
        aria-describedby={undefined}
        className={cn(
          'fixed inset-y-0 right-0 z-50 flex h-full w-full flex-col border-l border-border-sutil bg-surface-card shadow-lg transition ease-in-out data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:duration-300 data-[state=open]:duration-300 data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right',
          LARGURAS[largura],
          className,
        )}
        {...props}
      >
        {children}
        <SheetPrimitive.Close
          aria-label="Fechar"
          className="absolute right-4 top-4 rounded-sm text-text-tertiary transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="size-4" />
        </SheetPrimitive.Close>
      </SheetPrimitive.Content>
    </SheetPrimitive.Portal>
  );
}

export function SheetTitle({ className, ...props }: ComponentProps<typeof SheetPrimitive.Title>) {
  return <SheetPrimitive.Title className={cn('text-lg font-semibold leading-tight text-text-primary', className)} {...props} />;
}

export function SheetDescription({ className, ...props }: ComponentProps<typeof SheetPrimitive.Description>) {
  return <SheetPrimitive.Description className={cn('text-sm text-text-tertiary', className)} {...props} />;
}
