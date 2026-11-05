import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

// O TOPO DE TODA PÁGINA: título, uma linha de subtítulo e a ação na mesma linha.
// A regra que mora em parágrafo não mora aqui: ela vai para a ajuda do campo
// onde a dúvida aparece.

interface PaginaCabecalhoProps {
  titulo: ReactNode;
  subtitulo?: ReactNode;
  /** O botão à direita: "Novo item". */
  acao?: ReactNode;
  /** O link de volta, na ficha: `{ para: '/colaboradores', rotulo: 'Colaboradores' }`. */
  voltar?: { para: string; rotulo: string };
}

export default function PaginaCabecalho({ titulo, subtitulo, acao, voltar }: PaginaCabecalhoProps) {
  return (
    <div className="mb-6 space-y-2">
      {voltar && (
        <Link to={voltar.para} className="inline-flex items-center gap-1.5 text-sm text-text-tertiary transition-colors hover:text-text-primary">
          <ArrowLeft className="size-4" /> {voltar.rotulo}
        </Link>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="break-words text-2xl font-bold text-text-primary">{titulo}</h2>
          {subtitulo && <p className="mt-1 text-sm text-text-tertiary">{subtitulo}</p>}
        </div>
        {acao && <div className="flex shrink-0 items-center gap-2">{acao}</div>}
      </div>
    </div>
  );
}
