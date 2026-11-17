import type { ComponentProps, ReactNode } from 'react';
import { cn } from '../../helpers/cn.helper';

// AS COLUNAS NÃO SE MEXEM (BA). `table-fixed` tira a largura do conteúdo: filtrar ou trocar
// de página não desloca nada. A largura vem do TIPO da coluna (`coluna`), a mesma na lista e
// na aba da ficha, e o nome fica sem largura, com o que sobra (DH).
//
// A COLUNA APARECE QUANDO CABE (DH): `aparece` diz a partir de que largura da MOLDURA ela
// entra, e não da tela, porque com o menu aberto o tablet tem menos espaço que o celular
// deitado. Na moldura estreita ficam o nome, o Status e o `⋯`, sem rolar de lado.
//
// TODA LINHA TEM A MESMA ALTURA (BB): duas linhas de texto no máximo, a segunda em
// `TableSublinha`, e o que não cabe vira `…`, com o texto inteiro no `title`. Quebrar
// a célula deixava cada lista de uma altura.

/** O texto inteiro no `title`, para o que o `…` cortou. */
function tituloDe(conteudo: ReactNode): string | undefined {
  return typeof conteudo === 'string' ? conteudo : undefined;
}

/** O tipo da coluna, que dá a largura. A do nome não tem tipo: fica com o que sobra. */
export type TipoDeColuna = 'etiqueta' | 'relacao' | 'rotulo' | 'quantidade' | 'prazo' | 'data' | 'dataHora' | 'curta' | 'status' | 'contagem';

const LARGURA: Record<TipoDeColuna, string> = {
  etiqueta: 'w-36 @lg:w-44',
  relacao: 'w-[16%]',
  rotulo: 'w-36',
  quantidade: 'w-60',
  prazo: 'w-48',
  data: 'w-32',
  dataHora: 'w-40',
  curta: 'w-24',
  status: 'w-36',
  contagem: 'w-24 text-right',
};

/** A partir de que largura da moldura a coluna aparece. Sem ela, aparece sempre. */
export type ApareceEm = 'md' | 'lg' | '2xl' | '3xl' | '4xl' | '5xl';

const APARECE: Record<ApareceEm, string> = {
  md: 'hidden @md:table-cell',
  lg: 'hidden @lg:table-cell',
  '2xl': 'hidden @2xl:table-cell',
  '3xl': 'hidden @3xl:table-cell',
  '4xl': 'hidden @4xl:table-cell',
  '5xl': 'hidden @5xl:table-cell',
};

interface ColunaProps {
  coluna?: TipoDeColuna;
  aparece?: ApareceEm;
}

function classeDaColuna({ coluna, aparece }: ColunaProps): string | undefined {
  return cn(coluna && LARGURA[coluna], aparece && APARECE[aparece]) || undefined;
}

export function Table({ className, ...props }: ComponentProps<'table'>) {
  return (
    <div className="@container relative w-full overflow-x-auto">
      <table className={cn('w-full table-fixed text-sm tabular-nums', className)} {...props} />
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

export function TableHead({ className, coluna, aparece, ...props }: ComponentProps<'th'> & ColunaProps) {
  return (
    <th
      className={cn('h-11 truncate px-4 text-left align-middle font-medium text-text-tertiary', classeDaColuna({ coluna, aparece }), className)}
      {...props}
    />
  );
}

/** A coluna do `⋯`, igual em toda lista: da largura do botão, e o título só para o leitor de tela. */
export function TableHeadAcoes() {
  return <TableHead className="w-12 px-2"><span className="sr-only">Ações</span></TableHead>;
}

export function TableCell({ className, coluna, aparece, ...props }: ComponentProps<'td'> & ColunaProps) {
  return (
    <td
      title={tituloDe(props.children)}
      className={cn('truncate px-4 py-1.5 align-middle text-text-secondary', classeDaColuna({ coluna, aparece }), className)}
      {...props}
    />
  );
}

/** A célula do `⋯`, na largura de `TableHeadAcoes`. */
export function TableCellAcoes({ className, ...props }: ComponentProps<'td'>) {
  return <TableCell className={cn('px-2', className)} {...props} />;
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
