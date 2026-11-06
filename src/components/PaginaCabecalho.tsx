import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useVagaDoTitulo } from '../hooks/useVagaDoTitulo';

// O TOPO DE TODA PÁGINA: o título sobe para o cabeçalho (`useVagaDoTitulo`), com o
// voltar ao lado, e NADA MAIS vai lá (BB): o botão da lista fica na barra dela
// (`ListToolbar`) e o da ficha, no card (`CartaoDaFicha`). Não há subtítulo: a explicação
// vai para a ajuda do campo onde a dúvida aparece, e o dado, para a própria tela.

interface PaginaCabecalhoProps {
  titulo: ReactNode;
  /** O link de volta, na ficha: `{ para: '/colaboradores', rotulo: 'Colaboradores' }`. */
  voltar?: { para: string; rotulo: string; state?: unknown };
}

export default function PaginaCabecalho({ titulo, voltar }: PaginaCabecalhoProps) {
  const vaga = useVagaDoTitulo((estado) => estado.vaga);

  if (!vaga) return null;

  return createPortal(
    <>
      {voltar && (
        <Link
          to={voltar.para}
          state={voltar.state}
          aria-label={`Voltar para ${voltar.rotulo}`}
          title={`Voltar para ${voltar.rotulo}`}
          className="shrink-0 text-text-tertiary transition-colors hover:text-text-primary"
        >
          <ArrowLeft className="size-5" />
        </Link>
      )}
      <h2 className="truncate text-lg font-bold text-text-primary">{titulo}</h2>
    </>,
    vaga,
  );
}
