import { Undo2, X } from 'lucide-react';
import MovimentacoesEstoque from './MovimentacoesEstoque';
import { useStockItemQuery, useStockMovementsQuery } from '../../../domain/stock/stock.queries';
import type { ItemDeEstoque } from '../../../domain/shared/stock.types';
import { classeDoSaldo } from '../helpers/estoque.helper';
import { momentoDoEvento } from '../../helpers/historico.helper';

// O DETALHE DO ITEM: quem está com as unidades que saíram, e a linha do tempo.
//
// A LISTA DE "FORA" É ONDE A DEVOLUÇÃO ACONTECE — e o botão é por LINHA, não
// por item: cada unidade é um `StockMovement` identificado, e devolver pede o
// id DELE, não o do item (`checkin-stock.usecase.ts`).

interface ItemDetalheModalProps {
  item: ItemDeEstoque;
  onClose: () => void;
  onDevolver: (movementId: string) => void;
}

const ROTULO = 'text-text-tertiary uppercase tracking-widest text-[10px]';

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <span className={ROTULO}>{rotulo}</span>
      <div className="text-text-secondary">{children}</div>
    </div>
  );
}

export default function ItemDetalheModal({ item, onClose, onDevolver }: ItemDetalheModalProps) {
  // A linha da listagem desenha o cabeçalho no primeiro quadro; a consulta
  // abaixo traz as unidades fora e o saldo fresco em seguida.
  const { data: detalhe } = useStockItemQuery(item.id);
  const { data: movimentacao, isPending: movimentacaoPendente } = useStockMovementsQuery(item.id);

  const atual = detalhe ?? item;
  const unidadesFora = detalhe?.unidadesFora ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-bg-base/80 backdrop-blur-sm">
      <div className="relative w-full max-w-3xl bg-surface-card border border-border-sutil shadow-2xl flex flex-col max-h-[85vh]">

        <div className="flex items-center justify-between px-6 py-4 border-b border-border-sutil bg-bg-base/50 shrink-0">
          <div>
            <h2 className="text-sm font-mono text-text-primary tracking-widest uppercase">{atual.name}</h2>
            <p className="font-mono text-[10px] text-text-tertiary mt-1">{atual.category.name}</p>
          </div>
          <button onClick={onClose} className="p-2 text-text-tertiary hover:text-text-primary transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="p-6 font-mono text-xs space-y-6 overflow-y-auto">

          <div className="grid grid-cols-3 gap-4">
            <Campo rotulo="Total">{atual.qty}</Campo>
            <Campo rotulo="Disponível"><span className={classeDoSaldo(atual)}>{atual.disponivel}</span></Campo>
            <Campo rotulo="Fora">{atual.fora}</Campo>
          </div>

          {atual.notes && <Campo rotulo="Notas">{atual.notes}</Campo>}

          <div className="space-y-3">
            <span className={ROTULO}>Fora do estoque</span>
            {unidadesFora.length === 0 ? (
              <p className="text-text-tertiary">Nenhuma unidade fora — tudo no estoque.</p>
            ) : (
              <ul className="space-y-2">
                {unidadesFora.map((unidade) => (
                  <li key={unidade.id} className="border border-border-sutil p-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-text-secondary">
                        {unidade.targetType === 'PERSON' ? 'Colaborador: ' : 'Posto: '}
                        {unidade.targetPerson?.name ?? unidade.targetWorkstation?.name ?? '—'}
                      </p>
                      <p className="text-[10px] text-text-tertiary mt-1">
                        desde {momentoDoEvento(unidade.createdAt)}
                        {unidade.notes && <> · {unidade.notes}</>}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onDevolver(unidade.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 border border-border-sutil text-text-tertiary hover:text-status-success hover:border-status-success/40 uppercase tracking-widest text-[10px] transition-colors shrink-0"
                    >
                      <Undo2 size={12} /> Devolver
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="space-y-3">
            <span className={ROTULO}>Movimentação</span>
            <MovimentacoesEstoque eventos={movimentacao?.rows ?? []} carregando={movimentacaoPendente} />
          </div>
        </div>
      </div>
    </div>
  );
}
