import { Cpu } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { EntregaNaFicha } from '../../../../domain/shared/stock.types';
import { formatarDiaDoInstante } from '../../../helpers/format.helper';
import { caminhoDoItem, textoDeUnidades } from '../../../helpers/estoque.helper';

// A ABA COMPONENTES — "o que está instalado NESTA máquina agora" (AI): a
// memória, o SSD. Uma linha por entrega, como a ficha do posto.
//
// SÓ AS ENTREGAS ABERTAS: as já retiradas estão na aba Histórico. O componente
// fica no computador mesmo quando ele muda de mãos — a peça está dentro dele.
//
// SEM RETIRAR: ele mora no detalhe do item, como a devolução de licença mora na
// tela de Licenças. O nome do item leva até lá, já filtrado por este computador.

interface ComponentesTabProps {
  componentes: EntregaNaFicha[];
  /** A etiqueta do computador: o link leva ao detalhe do item já filtrado por ela. */
  assetTag: string;
  carregando: boolean;
  erro: string | null;
}

const CABECALHO = 'px-3 py-2 text-left text-[10px] uppercase tracking-widest text-text-tertiary font-normal';

export default function ComponentesTab({ componentes, assetTag, carregando, erro }: ComponentesTabProps) {
  if (carregando) return <p className="text-text-tertiary">Carregando componentes…</p>;
  if (erro) return <p role="alert" className="text-status-danger">Não foi possível carregar os componentes: {erro}</p>;

  if (componentes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-text-tertiary gap-3">
        <Cpu size={24} className="opacity-50" />
        <span>Nenhum componente instalado neste ativo.</span>
        <span className="text-[10px] max-w-md text-center leading-relaxed">
          Memória e SSD são itens de categoria Componente, entregues a um computador pela tela de{' '}
          <Link to="/estoque" className="text-text-secondary underline-offset-2 hover:underline">Estoque</Link>.
        </span>
      </div>
    );
  }

  return (
    <div className="border border-border-sutil bg-surface-card overflow-x-auto">
      <table className="w-full font-mono text-xs">
        <thead className="border-b border-border-sutil bg-bg-base/40">
          <tr>
            <th className={CABECALHO}>Componente</th>
            <th className={CABECALHO}>Categoria</th>
            <th className={CABECALHO}>Quantidade</th>
            <th className={CABECALHO}>Desde</th>
          </tr>
        </thead>
        <tbody>
          {componentes.map((entrega) => (
            <tr key={entrega.id} className="border-b border-border-sutil/50 last:border-0">
              <td className="px-3 py-2">
                <Link to={caminhoDoItem(entrega.item.id, assetTag)} className="text-text-primary hover:underline underline-offset-2">
                  {entrega.item.name}
                </Link>
                {entrega.notes && (
                  <div className="text-[10px] text-text-secondary mt-0.5">{entrega.notes}</div>
                )}
              </td>
              <td className="px-3 py-2 text-text-secondary">{entrega.item.category.name}</td>
              <td className="px-3 py-2 text-text-secondary">{textoDeUnidades(entrega.unidades)}</td>
              <td className="px-3 py-2 text-text-tertiary">{formatarDiaDoInstante(entrega.checkoutAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
