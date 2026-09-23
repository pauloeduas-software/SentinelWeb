import { ArrowRightLeft, Edit2, RotateCcw, Scale, Trash2 } from 'lucide-react';
import type { ItemDeEstoque } from '../../../domain/shared/stock.types';
import type { ListView } from '../../../domain/shared/list.types';
import { corDoSaldo, saldoLegivel } from '../helpers/estoque.helper';
import { formatarMoeda } from '../../helpers/format.helper';

// A tabela das três abas. Apresentacional puro: recebe valor e callback, não
// conhece query nem HTTP.
//
// A COLUNA PRINCIPAL É `disponivel / qty`, e os dois números sempre aparecem.
// Mostrar só o disponível esconde metade da informação — "4" não diz se sobrou
// muito ou pouco —, e mostrar só a quantidade seria a tela de antes da F5, que
// não sabia o que tinha saído.

interface StockTableProps {
  itens: ItemDeEstoque[];
  view: ListView;
  /** O verbo da saída muda por aba: Entregar / Dar baixa / Instalar. */
  rotuloDaSaida: string;
  onAbrir: (item: ItemDeEstoque) => void;
  onEditar: (item: ItemDeEstoque) => void;
  onAjustar: (item: ItemDeEstoque) => void;
  onSaida: (item: ItemDeEstoque) => void;
  onExcluir: (item: ItemDeEstoque) => void;
  onRestaurar: (item: ItemDeEstoque) => void;
  vazio: React.ReactNode;
}

const CABECALHO = 'px-4 py-3 text-left text-[10px] uppercase tracking-widest text-text-tertiary font-normal';

export default function StockTable({
  itens, view, rotuloDaSaida, onAbrir, onEditar, onAjustar, onSaida, onExcluir, onRestaurar, vazio,
}: StockTableProps) {
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
            <th className={`${CABECALHO} text-right`}>Disp. / total</th>
            <th className={CABECALHO}>Mínimo</th>
            <th className={CABECALHO}>Onde fica</th>
            <th className={`${CABECALHO} text-right`}>Custo</th>
            <th className={`${CABECALHO} text-right`}>Ações</th>
          </tr>
        </thead>
        <tbody>
          {itens.map((item) => {
            const cor = corDoSaldo(item);
            const naLixeira = view === 'trashed';

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
                  {(item.modelNumber || item.serial) && (
                    <div className="text-[10px] text-text-tertiary mt-0.5">
                      {item.modelNumber}
                      {item.modelNumber && item.serial && ' · '}
                      {item.serial && `SN ${item.serial}`}
                    </div>
                  )}
                </td>

                <td className="px-4 py-3">
                  {/* A cor vem do banco (Category.color): vai por `style`, porque
                      o Tailwind não gera classe a partir de string de runtime. */}
                  {item.category ? (
                    <span
                      className="px-2 py-0.5 border rounded-[2px] text-[10px] uppercase tracking-widest"
                      style={item.category.color
                        ? { color: item.category.color, borderColor: `${item.category.color}33`, backgroundColor: `${item.category.color}1a` }
                        : undefined}
                    >
                      {item.category.name}
                    </span>
                  ) : <span className="text-text-tertiary">—</span>}
                </td>

                <td className="px-4 py-3 text-right tabular-nums" style={cor ? { color: cor } : undefined}>
                  {saldoLegivel(item)}
                  {item.emUso > 0 && (
                    <div className="text-[10px] text-text-tertiary">{item.emUso} fora</div>
                  )}
                </td>

                <td className="px-4 py-3 tabular-nums text-text-secondary">{item.minQty ?? '—'}</td>
                <td className="px-4 py-3 text-text-secondary">{item.location?.name ?? '—'}</td>
                <td className="px-4 py-3 text-right tabular-nums text-text-secondary">
                  {formatarMoeda(item.purchaseCost)}
                </td>

                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    {naLixeira ? (
                      <IconeDeAcao titulo="Restaurar" onClick={() => onRestaurar(item)} icone={RotateCcw} />
                    ) : (
                      <>
                        <IconeDeAcao
                          titulo={item.disponivel > 0 ? rotuloDaSaida : 'Sem unidade disponível'}
                          onClick={() => onSaida(item)}
                          icone={ArrowRightLeft}
                          desabilitado={item.disponivel <= 0}
                        />
                        <IconeDeAcao titulo="Ajustar quantidade" onClick={() => onAjustar(item)} icone={Scale} />
                        <IconeDeAcao titulo="Editar" onClick={() => onEditar(item)} icone={Edit2} />
                        <IconeDeAcao titulo="Lixeira" onClick={() => onExcluir(item)} icone={Trash2} perigo />
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

interface IconeDeAcaoProps {
  titulo: string;
  onClick: () => void;
  icone: typeof Edit2;
  perigo?: boolean;
  desabilitado?: boolean;
}

function IconeDeAcao({ titulo, onClick, icone: Icone, perigo, desabilitado }: IconeDeAcaoProps) {
  return (
    <button
      type="button"
      title={titulo}
      aria-label={titulo}
      disabled={desabilitado}
      onClick={onClick}
      className={`p-2 transition-colors disabled:opacity-25 disabled:cursor-not-allowed ${
        perigo
          ? 'text-text-tertiary hover:text-status-danger'
          : 'text-text-tertiary hover:text-text-primary'
      }`}
    >
      <Icone size={13} />
    </button>
  );
}
