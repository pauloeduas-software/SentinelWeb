import type { ComponentProps } from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { cn } from '../../helpers/cn.helper';

/** Um `Provider` por dica, para o menu ser o único a usá-las sem mexer no App. */
export function Tooltip({ children }: { children: React.ReactNode }) {
  return (
    <TooltipPrimitive.Provider delayDuration={200}>
      <TooltipPrimitive.Root>{children}</TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}
export const TooltipTrigger = TooltipPrimitive.Trigger;

export function TooltipContent({ className, sideOffset = 6, ...props }: ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        sideOffset={sideOffset}
        className={cn('z-50 rounded-md border border-border-sutil bg-surface-card px-3 py-1.5 text-sm text-text-primary shadow-md animate-in fade-in-0 zoom-in-95', className)}
        {...props}
      />
    </TooltipPrimitive.Portal>
  );
}
