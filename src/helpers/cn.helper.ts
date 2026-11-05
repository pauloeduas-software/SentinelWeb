import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Junta classes do Tailwind; a que vem por último ganha do conflito (`p-2` e `p-4`). */
export function cn(...classes: ClassValue[]): string {
  return twMerge(clsx(classes));
}
