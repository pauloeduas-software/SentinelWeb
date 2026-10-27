import { Edit2, Power, PowerOff, Trash2, UserPlus } from 'lucide-react';
import type { ItemDeEstoque } from '../../../domain/shared/stock.types';
import { classeDaConta, motivoParaNaoEntregar, resumoDaContagem } from '../helpers/estoque.helper';

// A tabela de estoque. Apresentacional puro: recebe valor e callback, não
// conhece query nem HTTP.
//
// A COLUNA PRINCIPAL É A CONTA — total, em uso, disponíveis —, e os números
// aparecem todos, como na `LicencaTable`: "3 disponíveis" sozinho não diz se
// sobrou muito ou pouco.
//
// O CADASTRO É O DAS CONFIGURAÇÕES (`CatalogTable`): Editar, Desativar/Ativar
// e Excluir, nessa ordem; o desativado fica na lista, esmaecido e marcado; e
// Excluir sempre clica — o item já entregue recebe o 409 do servidor, que
// manda desativar.

interface EstoqueTableProps {
  itens: ItemDeEstoque[];
  /** Uma ação está correndo: os botões esperam, para o duplo clique não virar erro. */
  ocupado: boolean;
  onAbrir: (item: ItemDeEstoque) => void;
  onEntregar: (item: ItemDeEstoque) => void;
  onEditar: (item: ItemDeEstoque) => void;
  /** Desativar e ativar — o mesmo botão, pelo estado do item. */
  onAlternarAtivo: (item: ItemDeEstoque) => void;
  /** Excluir é `ADMIN` no servidor. Ausente, o botão some — quem decide é a página. */
  onExcluir?: (item: ItemDeEstoque) => void;
  vazio: React.ReactNode;
}

const CABECALHO = 'px-4 py-3 text-left text-[10px] uppercase tracking-widest text-text-tertiary font-normal';
const BOTAO = 'text-text-tertiary transition-colors disabled:opacity-30 disabled:hover:text-text-tertiary';

export default function EstoqueTable({
  itens, ocupado, onAbrir, onEntregar, onEditar, onAlternarAtivo, onExcluir, vazio,
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
            <th className={CABECALHO}>Quantidade</th>
            <th className={`${CABECALHO} text-right`}>Ações</th>
          </tr>
        </thead>
        <tbody>
          {itens.map((item) => {
            const motivoSemEntrega = motivoParaNaoEntregar(item);

            return (
              <tr
                key={item.id}
                className={`border-b border-border-sutil/50 last:border-0 hover:bg-bg-base/40 transition-colors group ${item.isActive ? '' : 'opacity-60'}`}
              >
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => onAbrir(item)}
                    className="text-text-primary hover:text-text-secondary underline-offset-2 hover:underline text-left"
                  >
                    {item.name}
                  </button>
                  {!item.isActive && (
                    <span className="ml-3 text-[10px] text-status-warning uppercase tracking-widest">desativado</span>
                  )}
                  {item.notes && (
                    <div className="text-[10px] text-text-tertiary mt-1 line-clamp-1">{item.notes}</div>
                  )}
                </td>

                <td className="px-4 py-3 text-text-secondary">{item.category.name}</td>

                <td className="px-4 py-3 text-text-secondary">{item.location?.name ?? '—'}</td>

                <td className={`px-4 py-3 ${classeDaConta(item)}`}>{resumoDaContagem(item)}</td>

                <td className="px-4 py-3">
                  {/* Visível ao passar o mouse, ao navegar por Tab
                      (`focus-within`) e sempre no toque, como na `CatalogTable`. */}
                  <div className="flex items-center justify-end gap-3 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 transition-opacity">
                    {item.isActive && (
                      <button
                        type="button"
                        onClick={() => onEntregar(item)}
                        disabled={motivoSemEntrega !== null}
                        title={motivoSemEntrega ?? 'Entregar'}
                        aria-label={`Entregar ${item.name}`}
                        className={`${BOTAO} hover:text-text-primary`}
                      >
                        <UserPlus size={14} />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onEditar(item)}
                      title="Editar"
                      aria-label={`Editar ${item.name}`}
                      className={`${BOTAO} hover:text-text-primary`}
                    >
                      <Edit2 size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => onAlternarAtivo(item)}
                      disabled={ocupado}
                      title={item.isActive ? 'Desativar' : 'Ativar'}
                      aria-label={`${item.isActive ? 'Desativar' : 'Ativar'} ${item.name}`}
                      className={`${BOTAO} hover:text-status-info`}
                    >
                      {item.isActive ? <PowerOff size={14} /> : <Power size={14} />}
                    </button>
                    {onExcluir && (
                      <button
                        type="button"
                        onClick={() => onExcluir(item)}
                        disabled={ocupado}
                        title="Excluir"
                        aria-label={`Excluir ${item.name}`}
                        className={`${BOTAO} hover:text-status-danger`}
                      >
                        <Trash2 size={14} />
                      </button>
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
