import type { ReactNode } from 'react';
import type { Volta } from '../hooks/useVoltaComFiltros';
import PaginaCabecalho from './PaginaCabecalho';
import { Aviso } from './ui/aviso';
import { Card } from './ui/card';
import { GradeDeDados } from './ui/dado';

// O TOPO DE TODA FICHA (BB): a marca, o que identifica o registro e, à direita, as
// ações dele. O cabeçalho da página só tem o título e o voltar.

interface CartaoDaFichaProps {
  /** O ícone do assunto (`IconeDaFicha`) ou o avatar da pessoa. */
  marca: ReactNode;
  acoes?: ReactNode;
  children: ReactNode;
}

export default function CartaoDaFicha({ marca, acoes, children }: CartaoDaFichaProps) {
  return (
    <Card className="flex flex-wrap gap-4 p-6 lg:flex-nowrap">
      {marca}
      <GradeDeDados className="min-w-0 flex-1 basis-60 md:grid-cols-4 xl:grid-cols-6">{children}</GradeDeDados>
      {acoes && <div className="flex shrink-0 items-center gap-2 self-start">{acoes}</div>}
    </Card>
  );
}

export function IconeDaFicha({ children }: { children: ReactNode }) {
  return (
    <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground [&_svg]:size-5">
      {children}
    </span>
  );
}

interface FichaIndisponivelProps {
  /** O nome da lista, no título e no link: "Computadores". */
  lista: string;
  /** O nome no link: a lista, ou a ficha que abriu esta (`rotuloDaVolta`). */
  rotuloDaVolta: string;
  voltar: Volta;
  carregando: boolean;
  erro: string | null;
}

/** A ficha que ainda não chegou ou não existe: o cabeçalho não fica sem título. */
export function FichaIndisponivel({ lista, rotuloDaVolta, voltar, carregando, erro }: FichaIndisponivelProps) {
  return (
    <div className="space-y-4">
      <PaginaCabecalho titulo={lista} voltar={{ ...voltar, rotulo: rotuloDaVolta }} />
      {carregando ? <p className="text-sm text-text-tertiary">Carregando…</p> : <Aviso>{erro}</Aviso>}
    </div>
  );
}
