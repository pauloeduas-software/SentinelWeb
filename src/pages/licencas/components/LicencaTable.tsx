import { Archive, Edit2, Trash2, UserPlus } from 'lucide-react';
import type { Licenca, RecorteDaLicenca } from '../../../domain/shared/license.types';
import { ROTULO_DO_STATUS, resumoDaContagem, textoDoPrazo } from '../../helpers/licenca.helper';
import { motivoParaNaoEntregar, motivoParaNaoExcluir } from '../helpers/licenca.helper';
import { formatarData, formatarMoeda } from '../../helpers/format.helper';

// A tabela de licenças. Apresentacional puro: recebe valor e callback, não
// conhece query nem HTTP.
//
// A COLUNA PRINCIPAL É A CONTA — compradas, em uso, livres —, e os
// números aparecem todos: "2 livres" sozinho não diz se sobrou muito ou pouco.

interface LicencaTableProps {
  licencas: Licenca[];
  view: RecorteDaLicenca;
  /** Uma ação está correndo: os botões esperam, para o duplo clique não virar erro. */
  ocupado: boolean;
  onAbrir: (licenca: Licenca) => void;
  onEditar: (licenca: Licenca) => void;
  onEntregar: (licenca: Licenca) => void;
  onEncerrar: (licenca: Licenca) => void;
  /** Excluir é `ADMIN` no servidor. Ausente, o botão some — quem decide é a página. */
  onExcluir?: (licenca: Licenca) => void;
  vazio: React.ReactNode;
}

const CABECALHO = 'px-4 py-3 text-left text-[10px] uppercase tracking-widest text-text-tertiary font-normal';
const BOTAO = 'p-1.5 text-text-tertiary transition-colors disabled:opacity-30 disabled:hover:text-text-tertiary';

export default function LicencaTable({
  licencas, view, ocupado, onAbrir, onEditar, onEntregar, onEncerrar, onExcluir, vazio,
}: LicencaTableProps) {
  if (licencas.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-text-tertiary font-mono text-xs gap-3 border border-border-sutil bg-surface-card">
        {vazio}
      </div>
    );
  }

  const encerradas = view === 'encerradas';

  return (
    <div className="border border-border-sutil bg-surface-card overflow-x-auto">
      <table className="w-full font-mono text-xs">
        <thead className="border-b border-border-sutil bg-bg-base/40">
          <tr>
            <th className={CABECALHO}>Licença</th>
            <th className={CABECALHO}>Status</th>
            <th className={CABECALHO}>Quantidade</th>
            <th className={CABECALHO}>{encerradas ? 'Encerrada em' : 'Vencimento'}</th>
            <th className={`${CABECALHO} text-right`}>Custo</th>
            <th className={`${CABECALHO} text-right`}>Ações</th>
          </tr>
        </thead>
        <tbody>
          {licencas.map((licenca) => {
            const motivoSemEntrega = motivoParaNaoEntregar(licenca);
            const motivoSemExcluir = motivoParaNaoExcluir(licenca);

            return (
              <tr key={licenca.id} className="border-b border-border-sutil/50 last:border-0 hover:bg-bg-base/40 transition-colors">
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => onAbrir(licenca)}
                    className="text-text-primary hover:text-text-secondary underline-offset-2 hover:underline text-left"
                  >
                    {licenca.name}
                  </button>
                  <div className="text-[10px] text-text-tertiary mt-1">
                    {licenca.manufacturer?.name ?? licenca.category?.name ?? '—'}
                  </div>
                </td>

                <td className="px-4 py-3 text-text-secondary">{ROTULO_DO_STATUS[licenca.status]}</td>

                <td className="px-4 py-3 text-text-secondary">{resumoDaContagem(licenca)}</td>

                <td className="px-4 py-3 text-text-secondary">
                  {encerradas ? formatarData(licenca.terminationDate) : textoDoPrazo(licenca.diasParaVencer)}
                </td>

                <td className="px-4 py-3 text-right text-text-secondary">
                  {formatarMoeda(licenca.purchaseCost)}
                </td>

                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    {!encerradas && (
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
                    {!encerradas && (
                      <button
                        type="button"
                        onClick={() => onEncerrar(licenca)}
                        disabled={ocupado}
                        title="Encerrar — o contrato acabou"
                        aria-label="Encerrar"
                        className={`${BOTAO} hover:text-text-primary`}
                      >
                        <Archive size={14} />
                      </button>
                    )}
                    {onExcluir && (
                      <button
                        type="button"
                        onClick={() => onExcluir(licenca)}
                        disabled={ocupado || motivoSemExcluir !== null}
                        title={motivoSemExcluir ?? 'Excluir de vez — cadastro errado'}
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
