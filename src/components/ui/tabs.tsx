import { useState, type ComponentProps } from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { cn } from '../../helpers/cn.helper';

export const Tabs = TabsPrimitive.Root;

// UM DESENHO SÓ DE ABA NO SISTEMA (BB): sublinhado, com a linha de baixo aqui, e o
// mesmo das vistas de uma lista (`VistasDaLista`). O `className` vai na linha de baixo,
// para o espaço até o conteúdo; quem não cabe rola para o lado.
export function TabsList({ className, ...props }: ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <div className={cn('border-b border-border-sutil', className)}>
      <TabsPrimitive.List className="-mb-px flex max-w-full items-center gap-6 overflow-x-auto text-text-secondary" {...props} />
    </div>
  );
}

/** O número ao lado do nome da aba. Sempre à vista, inclusive o zero: o nome ao lado não anda. */
export function ContagemDaAba({ children }: { children: number | undefined }) {
  // Sem resposta do servidor não há número: zero seria dizer que não há nada.
  if (children === undefined) return null;
  return <span className="text-xs tabular-nums text-text-tertiary">{children}</span>;
}

// O ANEL É DE QUEM VEM PELO TECLADO. O Radix foca a aba por script no `mousedown`,
// e o navegador trata esse foco como de teclado: sem `clicada`, toda aba clicada
// fica com o anel. O foco continua nela, para as setas seguirem funcionando.
export function TabsTrigger({ className, ...props }: ComponentProps<typeof TabsPrimitive.Trigger>) {
  const [clicada, setClicada] = useState(false);
  return (
    <TabsPrimitive.Trigger
      className={cn(
        'inline-flex items-center justify-center gap-2 whitespace-nowrap border-b-2 border-transparent py-2.5 text-sm font-medium transition-all hover:text-text-primary focus-visible:outline-none focus-visible:not-data-clicada:ring-2 focus-visible:ring-inset focus-visible:ring-ring data-[state=active]:border-primary data-[state=active]:text-text-primary disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
        className,
      )}
      data-clicada={clicada || undefined}
      {...props}
      onPointerDown={(event) => {
        setClicada(true);
        props.onPointerDown?.(event);
      }}
      onBlur={(event) => {
        setClicada(false);
        props.onBlur?.(event);
      }}
    />
  );
}

export function TabsContent({ className, ...props }: ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content className={cn('focus-visible:outline-none', className)} {...props} />;
}
