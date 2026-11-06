import { cva } from 'class-variance-authority';

// Em arquivo próprio porque `react-refresh` só aceita componente no `.tsx`, e o
// link com cara de botão (`<Link className={buttonVariants(...)}>`) precisa disto.
export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        destructive: 'bg-destructive text-primary-foreground hover:bg-destructive/90',
        outline: 'border border-border-sutil bg-surface-card text-text-primary hover:bg-accent hover:text-accent-foreground',
        secondary: 'bg-surface-muted text-text-primary hover:bg-surface-muted/80',
        ghost: 'text-text-secondary hover:bg-accent hover:text-accent-foreground',
        link: 'text-link underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 px-4',
        sm: 'h-9 px-3',
        icon: 'size-10',
        'icon-sm': 'size-8',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);
