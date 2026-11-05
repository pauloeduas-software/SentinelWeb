import type { ComponentProps } from 'react';
import { cn } from '../../helpers/cn.helper';
import { useIdDoCampo } from './campo';

export const CLASSE_DO_CONTROLE =
  'flex w-full rounded-md border border-border-sutil bg-bg-base px-3 text-sm text-text-primary transition-colors placeholder:text-text-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-surface-card disabled:cursor-not-allowed disabled:opacity-50';

export function Input({ className, id, ...props }: ComponentProps<'input'>) {
  return <input id={useIdDoCampo(id)} className={cn(CLASSE_DO_CONTROLE, 'h-10', className)} {...props} />;
}

export function Textarea({ className, id, rows = 3, ...props }: ComponentProps<'textarea'>) {
  return <textarea id={useIdDoCampo(id)} rows={rows} className={cn(CLASSE_DO_CONTROLE, 'resize-none py-2', className)} {...props} />;
}
