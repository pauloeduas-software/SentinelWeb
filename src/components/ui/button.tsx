import type { ComponentProps } from 'react';
import { Slot } from '@radix-ui/react-slot';
import type { VariantProps } from 'class-variance-authority';
import { cn } from '../../helpers/cn.helper';
import { buttonVariants } from './button.variants';

interface ButtonProps extends ComponentProps<'button'>, VariantProps<typeof buttonVariants> {
  /** Empresta a aparência ao filho: o `<Link>` que parece botão. */
  asChild?: boolean;
}

export function Button({ className, variant, size, asChild = false, type, title, disabled, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : 'button';
  const botao = (
    <Comp
      // `button` por padrão: dentro de um `<form>`, o padrão do HTML é enviar.
      type={asChild ? undefined : (type ?? 'button')}
      className={cn(buttonVariants({ variant, size }), className)}
      title={disabled ? undefined : title}
      disabled={disabled}
      {...props}
    />
  );

  // Desabilitado, o botão não recebe o ponteiro: o motivo mora numa caixa em
  // volta dele, senão o `title` nunca aparece.
  return disabled && title ? <span title={title} className="inline-flex shrink-0">{botao}</span> : botao;
}
