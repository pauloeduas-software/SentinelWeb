import { Edit2, PackageMinus, PackagePlus, RotateCcw, Trash2 } from 'lucide-react';
import type { ItemDeEstoque } from '../../../domain/shared/stock.types';
import type { ListView } from '../../../domain/shared/list.types';
import { classeDoSaldo } from '../helpers/estoque.helper';

// A tabela de estoque. Apresentacional puro: recebe valor e callback, não
// conhece query nem HTTP.
//
// A COLUNA PRINCIPAL É `disponível / total`, e os dois números sempre
// aparecem — mostrar só o disponível esconde quanto já foi comprado, e só o
// total esconde o que está na rua agora (mesmo motivo do `LicencaTable`).

interface EstoqueTableProps {
  itens: ItemDeEstoque[];
  view: ListView;
  onAbrir: (item: ItemDeEstoque) => void;
  onAjustar: (item: ItemDeEstoque) => void;
  onSaida: (item: ItemDeEstoque) => void;
  onEditar: (item: ItemDeEstoque) => void;
  /**
   * Lixeira e restaurar são `ADMIN` no servidor. Ausentes, os botões somem —
   * quem decide é a página, que sabe o cargo; a tabela só desenha.
   */
  onExcluir?: (item: ItemDeEstoque) => void;
  onRestaurar?: (item: ItemDeEstoque) => void;
  vazio: React.ReactNode;
}

const CABECALHO = 'px-4 py-3 text-left text-[10px] uppercase tracking-widest text-text-tertiary font-normal';

export default function EstoqueTable({
  itens, view, onAbrir, onAjustar, onSaida, onEditar, onExcluir, onRestaurar, vazio,
}: EstoqueTableProps) {
  if (itens.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-text-tertiary font-mono text-xs gap-3 border border-border-sutil bg-surface-card">
        {vazio}
      </div>
    );
  }

  return (
    <div className="border border-border-sutil bg-surface-card overflow-x-auto">
      <table className="w-full font-mono text-xs">
        <thead className="border-b border-border-sutil bg-bg-base/40">
          <tr>
            <th className={CABECALHO}>Item</th>
            <th className={CABECALHO}>Categoria</th>
            <th className={CABECALHO}>Localização</th>
            <th className={`${CABECALHO} text-right`}>Disponível / total</th>
            <th className={`${CABECALHO} text-right`}>Ações</th>
          </tr>
        </thead>
        <tbody>
          {itens.map((item) => {
            const naLixeira = view === 'trashed';
            const podeSair = item.disponivel > 0;

            return (
              <tr key={item.id} className="border-b border-border-sutil/50 last:border-0 hover:bg-bg-base/40 transition-colors">
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => onAbrir(item)}
                    className="text-text-primary hover:text-status-success transition-colors text-left"
                  >
                    {item.name}
                  </button>
                  {item.notes && (
                    <div className="text-[10px] text-text-tertiary mt-1 line-clamp-1">{item.notes}</div>
                  )}
                </td>

                <td className="px-4 py-3 text-text-secondary">
                  {item.category.name}
                </td>

                <td className="px-4 py-3 text-text-secondary">
                  {item.location?.name ?? '—'}
                </td>

                <td className="px-4 py-3 text-right">
                  <span className={classeDoSaldo(item)}>{item.disponivel}</span>
                  <span className="text-text-tertiary"> / {item.qty}</span>
                  {item.fora > 0 && (
                    <div className="text-[10px] text-text-tertiary mt-1">{item.fora} fora</div>
                  )}
                </td>

                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    {naLixeira ? (
                      onRestaurar && (
                        <button
                          type="button"
                          onClick={() => onRestaurar(item)}
                          title="Restaurar"
                          className="p-1.5 text-text-tertiary hover:text-status-success transition-colors"
                        >
                          <RotateCcw size={14} />
                        </button>
                      )
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => onAjustar(item)}
                          title="Entrada ou baixa"
                          className="p-1.5 text-text-tertiary hover:text-status-success transition-colors"
                        >
                          <PackagePlus size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => onSaida(item)}
                          disabled={!podeSair}
                          title={podeSair ? 'Saída' : 'Sem unidade disponível'}
                          className="p-1.5 text-text-tertiary hover:text-status-warning transition-colors disabled:opacity-30 disabled:hover:text-text-tertiary"
                        >
                          <PackageMinus size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => onEditar(item)}
                          title="Editar"
                          className="p-1.5 text-text-tertiary hover:text-text-primary transition-colors"
                        >
                          <Edit2 size={14} />
                        </button>
                        {onExcluir && (
                          <button
                            type="button"
                            onClick={() => onExcluir(item)}
                            title="Mover para a lixeira"
                            className="p-1.5 text-text-tertiary hover:text-status-danger transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
