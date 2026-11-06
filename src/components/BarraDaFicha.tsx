import ListToolbar from './ListToolbar';
import { POR_PAGINA } from '../hooks/useListaNaUrl';

export interface BarraDaFichaProps {
  page: number;
  total: number;
  onPageChange: (page: number) => void;
}

/** A página de uma aba de ficha: só aparece com mais de uma, e a aba não ganha uma linha à toa. */
export default function BarraDaFicha({ page, total, onPageChange }: BarraDaFichaProps) {
  if (total <= POR_PAGINA && page === 1) return null;
  return <ListToolbar page={page} perPage={POR_PAGINA} total={total} onPageChange={onPageChange} />;
}
