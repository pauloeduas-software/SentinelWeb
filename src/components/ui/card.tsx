import type { ComponentProps } from 'react';
import { cn } from '../../helpers/cn.helper';

export function Card({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('rounded-lg border border-border-sutil bg-surface-card shadow-sm', className)} {...props} />;
}
