import type { ComponentProps, ReactNode } from 'react';
import { cn } from '../../helpers/cn.helper';

// AS COLUNAS NÃO SE MEXEM (BA). `table-fixed` tira a largura do conteúdo: filtrar ou trocar
// de página não desloca nada. A largura vem do `TableHead`, em `%` para acompanhar a tela, e
// em `rem` só no que tem tamanho certo (valor, data, o `⋯`); o nome fica sem largura, com o
// que sobra. A largura mínima faz a tabela rolar dentro da moldura em vez de espremer as
// colunas, e sobe em quem tem muita coluna ou `hidden md:`.
//
// TODA LINHA TEM A MESMA ALTURA (BB): duas linhas de texto no máximo, a segunda em
// `TableSublinha`, e o que não cabe vira `…`, com o texto inteiro no `title`. Quebrar
// a célula deixava cada lista de uma altura.

/** O texto inteiro no `title`, para o que o `…` cortou. */
function tituloDe(conteudo: ReactNode): string | undefined {
  return typeof conteudo === 'string' ? conteudo : undefined;
}

export function Table({ className, ...props }: ComponentProps<'table'>) {
  return (
    <div className="relative w-full overflow-x-auto">
      <table className={cn('w-full min-w-[36rem] table-fixed text-sm tabular-nums', className)} {...props} />
    </div>
  );
}

export function TableHeader({ className, ...props }: ComponentProps<'thead'>) {
  return <thead className={cn('[&_tr]:h-auto [&_tr]:border-b', className)} {...props} />;
}

/** O aviso de lista vazia, debaixo da tabela: o cabeçalho não some quando o filtro não acha nada. */
export function TableVazia({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('flex flex-col items-center justify-center gap-3 py-16 text-center text-sm text-text-tertiary', className)} {...props} />;
}

export function TableBody({ className, ...props }: ComponentProps<'tbody'>) {
  return <tbody className={cn('[&_tr:last-child]:border-0', className)} {...props} />;
}

interface TableRowProps extends ComponentProps<'tr'> {
  /** Desativado ou encerrado: continua na lista, esmaecido. */
  apagada?: boolean;
}

/** A linha com `onClick` abre o registro, e só ela reage ao mouse. */
export function TableRow({ className, apagada = false, ...props }: TableRowProps) {
  return (
    <tr
      className={cn(
        'h-[3.75rem] border-b border-border-sutil transition-colors',
        props.onClick && 'cursor-pointer hover:bg-surface-muted/50',
        apagada && 'opacity-60',
        className,
      )}
      {...props}
    />
  );
}

export function TableHead({ className, ...props }: ComponentProps<'th'>) {
  return <th className={cn('h-11 truncate px-4 text-left align-middle font-medium text-text-tertiary', className)} {...props} />;
}

/** A coluna do `⋯`, igual em toda lista. */
export function TableHeadAcoes() {
  return <TableHead className="w-24 text-right">Ações</TableHead>;
}

export function TableCell({ className, ...props }: ComponentProps<'td'>) {
  return <td title={tituloDe(props.children)} className={cn('truncate px-4 py-1.5 align-middle text-text-secondary', className)} {...props} />;
}

/** O nome na primeira coluna. O botão é o caminho do teclado: o clique sobe para a linha. */
export function TableNome({ className, ...props }: ComponentProps<'button'>) {
  return (
    <button
      type="button"
      title={tituloDe(props.children)}
      className={cn('block max-w-full truncate text-left font-medium text-text-primary focus-visible:underline focus-visible:outline-none', className)}
      {...props}
    />
  );
}

/** A primeira linha da célula que tem duas. */
export function TableLinha({ className, ...props }: ComponentProps<'div'>) {
  return <div title={tituloDe(props.children)} className={cn('truncate', className)} {...props} />;
}

/** A segunda linha da célula: o que explica a primeira. */
export function TableSublinha({ className, ...props }: ComponentProps<'div'>) {
  return <div title={tituloDe(props.children)} className={cn('mt-0.5 truncate text-xs text-text-tertiary', className)} {...props} />;
}
