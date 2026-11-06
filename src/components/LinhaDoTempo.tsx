import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import BarraDaFicha, { type BarraDaFichaProps } from './BarraDaFicha';
import { CartaoVazio } from './ListaVazia';
import { Card } from './ui/card';

// O HISTÓRICO DE UM REGISTRO, igual em toda ficha e janela (BB): o que aconteceu, o dia
// e a nota. Sem linhas, diz se ainda carrega, se a consulta falhou ou se não há nada,
// porque "nunca foi entregue" é uma afirmação, e só a resposta do servidor a sustenta.

export interface EventoDaLinha {
  id: string;
  icone: LucideIcon;
  titulo: ReactNode;
  /** O dia, já formatado: a hora de um dia passado seria inventada (AM). */
  dia: string;
  /** A nota, ou mais de uma linha dela: a posse diz também quem ocupou o posto. */
  nota?: ReactNode;
}

interface LinhaDoTempoProps {
  eventos: readonly EventoDaLinha[];
  icone: LucideIcon;
  vazio: string;
  carregando: boolean;
  erro: string | null;
  /** A página do servidor, nas fichas. A janela desenha a barra dela. */
  pagina?: BarraDaFichaProps;
}

export default function LinhaDoTempo({ eventos, icone, vazio, carregando, erro, pagina }: LinhaDoTempoProps) {
  if (eventos.length === 0) {
    return <CartaoVazio icone={icone} carregando={carregando} erro={erro} frase={vazio} />;
  }

  return (
    <>
      {pagina && <BarraDaFicha {...pagina} />}
      <Card className="overflow-hidden">
        <ul className="divide-y divide-border-sutil text-sm">
          {eventos.map(({ id, icone: Icone, titulo, dia, nota }) => (
            <li key={id} className="space-y-1 px-4 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="flex items-center gap-2 text-text-primary">
                  <Icone className="size-4 shrink-0 text-text-tertiary" />
                  {titulo}
                </span>
                <span className="shrink-0 text-xs tabular-nums text-text-tertiary">{dia}</span>
              </div>
              {nota && <div className="text-xs text-text-tertiary">{nota}</div>}
            </li>
          ))}
        </ul>
      </Card>

    </>
  );
}
