import type { ComponentProps } from 'react';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { cn } from '../../helpers/cn.helper';
import { CLASSE_DO_POPOVER } from './dropdown-menu';

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;

export function PopoverContent({ className, align = 'start', sideOffset = 4, ...props }: ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content align={align} sideOffset={sideOffset} className={cn(CLASSE_DO_POPOVER, 'outline-none', className)} {...props} />
    </PopoverPrimitive.Portal>
  );
}
