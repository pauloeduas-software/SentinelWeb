import { Edit2, Power, PowerOff, Trash2, UserPlus } from 'lucide-react';
import type { Licenca } from '../../../domain/shared/license.types';
import { ROTULO_DO_STATUS, resumoDaContagem, textoDoPrazo } from '../../helpers/licenca.helper';
import { motivoParaNaoEntregar } from '../helpers/licenca.helper';
import { formatarData, formatarMoeda } from '../../helpers/format.helper';

// A tabela de licenças. Apresentacional puro: recebe valor e callback, não
// conhece query nem HTTP.
//
// A COLUNA PRINCIPAL É A CONTA — compradas, em uso, livres —, e os
// números aparecem todos: "2 livres" sozinho não diz se sobrou muito ou pouco.
//
// O CADASTRO É O DAS CONFIGURAÇÕES (`CatalogTable`, AF): Editar,
// Encerrar/Reabrir no lugar do Desativar/Ativar, e Excluir; a encerrada fica na
// lista, esmaecida e marcada; e Excluir sempre clica — a licença já entregue
// recebe o 409 do servidor, que manda encerrar. Encerrar grava a data do fim do
// contrato, que entra no status e no alerta.

interface LicencaTableProps {
  licencas: Licenca[];
  /** Uma ação está correndo: os botões esperam, para o duplo clique não virar erro. */
  ocupado: boolean;
  onAbrir: (licenca: Licenca) => void;
  onEditar: (licenca: Licenca) => void;
  onEntregar: (licenca: Licenca) => void;
  /** Encerrar e reabrir — o mesmo botão, pelo status da licença. */
  onAlternarEncerrada: (licenca: Licenca) => void;
  /** Excluir é `ADMIN` no servidor. Ausente, o botão some — quem decide é a página. */
  onExcluir?: (licenca: Licenca) => void;
  vazio: React.ReactNode;
}

const CABECALHO = 'px-4 py-3 text-left text-[10px] uppercase tracking-widest text-text-tertiary font-normal';
const BOTAO = 'text-text-tertiary transition-colors disabled:opacity-30 disabled:hover:text-text-tertiary';

export default function LicencaTable({
  licencas, ocupado, onAbrir, onEditar, onEntregar, onAlternarEncerrada, onExcluir, vazio,
}: LicencaTableProps) {
  if (licencas.length === 0) {
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
            <th className={CABECALHO}>Licença</th>
            <th className={CABECALHO}>Status</th>
            <th className={CABECALHO}>Quantidade</th>
            <th className={CABECALHO}>Vencimento</th>
            <th className={`${CABECALHO} text-right`}>Custo</th>
            <th className={`${CABECALHO} text-right`}>Ações</th>
          </tr>
        </thead>
        <tbody>
          {licencas.map((licenca) => {
            const motivoSemEntrega = motivoParaNaoEntregar(licenca);
            const encerrada = licenca.status === 'ENCERRADA';

            return (
              <tr
                key={licenca.id}
                className={`border-b border-border-sutil/50 last:border-0 hover:bg-bg-base/40 transition-colors group ${encerrada ? 'opacity-60' : ''}`}
              >
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => onAbrir(licenca)}
                    className="text-text-primary hover:text-text-secondary underline-offset-2 hover:underline text-left"
                  >
                    {licenca.name}
                  </button>
                  {encerrada && (
                    <span className="ml-3 text-[10px] text-status-warning uppercase tracking-widest">encerrada</span>
                  )}
                  <div className="text-[10px] text-text-tertiary mt-1">
                    {licenca.manufacturer?.name ?? licenca.category?.name ?? '—'}
                  </div>
                </td>

                <td className="px-4 py-3 text-text-secondary">{ROTULO_DO_STATUS[licenca.status]}</td>

                <td className="px-4 py-3 text-text-secondary">{resumoDaContagem(licenca)}</td>

                <td className="px-4 py-3 text-text-secondary">
                  {encerrada ? `encerrada em ${formatarData(licenca.terminationDate)}` : textoDoPrazo(licenca.diasParaVencer)}
                </td>

                <td className="px-4 py-3 text-right text-text-secondary">
                  {formatarMoeda(licenca.purchaseCost)}
                </td>

                <td className="px-4 py-3">
                  {/* Visível ao passar o mouse, ao navegar por Tab
                      (`focus-within`) e sempre no toque, como na `CatalogTable`. */}
                  <div className="flex items-center justify-end gap-3 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 transition-opacity">
                    {!encerrada && (
                      <button
                        type="button"
                        onClick={() => onEntregar(licenca)}
                        disabled={motivoSemEntrega !== null}
                        title={motivoSemEntrega ?? 'Entregar'}
                        aria-label="Entregar"
                        className={`${BOTAO} hover:text-text-primary`}
                      >
                        <UserPlus size={14} />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onEditar(licenca)}
                      title="Editar"
                      aria-label="Editar"
                      className={`${BOTAO} hover:text-text-primary`}
                    >
                      <Edit2 size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => onAlternarEncerrada(licenca)}
                      disabled={ocupado}
                      title={encerrada ? 'Reabrir' : 'Encerrar'}
                      aria-label={encerrada ? 'Reabrir' : 'Encerrar'}
                      className={`${BOTAO} hover:text-status-info`}
                    >
                      {encerrada ? <Power size={14} /> : <PowerOff size={14} />}
                    </button>
                    {onExcluir && (
                      <button
                        type="button"
                        onClick={() => onExcluir(licenca)}
                        disabled={ocupado}
                        title="Excluir"
                        aria-label="Excluir"
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
