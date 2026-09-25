import { Edit2, KeyRound, RotateCcw, Trash2, UserPlus } from 'lucide-react';
import type { Licenca } from '../../../domain/shared/license.types';
import type { ListView } from '../../../domain/shared/list.types';
import { corDoStatus, textoDoPrazo } from '../helpers/licenca.helper';
import { formatarMoeda } from '../../helpers/format.helper';

// A tabela de licenças. Apresentacional puro: recebe valor e callback, não
// conhece query nem HTTP.
//
// A COLUNA PRINCIPAL É `livres / seatsTotal`, e os dois números sempre
// aparecem. Mostrar só os livres esconde metade da informação — "4" não diz se
// sobrou muito ou pouco —, e mostrar só o total seria o inventário de antes da
// F6, que não sabia o que estava em uso.

interface LicencaTableProps {
  licencas: Licenca[];
  view: ListView;
  onAbrir: (licenca: Licenca) => void;
  onEditar: (licenca: Licenca) => void;
  onEntregar: (licenca: Licenca) => void;
  onExcluir: (licenca: Licenca) => void;
  onRestaurar: (licenca: Licenca) => void;
  vazio: React.ReactNode;
}

const CABECALHO = 'px-4 py-3 text-left text-[10px] uppercase tracking-widest text-text-tertiary font-normal';

/** Verde quando sobra, âmbar quando está no piso, vermelho quando acabou. */
function corDosAssentos(licenca: Licenca): string {
  if (licenca.livres === 0) return '#ef4444';
  if (licenca.assentosBaixos) return '#f59e0b';
  return '#22c55e';
}

export default function LicencaTable({
  licencas, view, onAbrir, onEditar, onEntregar, onExcluir, onRestaurar, vazio,
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
            <th className={`${CABECALHO} text-right`}>Livres / total</th>
            <th className={CABECALHO}>Vencimento</th>
            <th className={CABECALHO}>Chave</th>
            <th className={`${CABECALHO} text-right`}>Custo</th>
            <th className={`${CABECALHO} text-right`}>Ações</th>
          </tr>
        </thead>
        <tbody>
          {licencas.map((licenca) => {
            const naLixeira = view === 'trashed';
            // Entregar só faz sentido com assento livre e contrato de pé:
            // oferecer o botão numa licença ENCERRADA seria convidar a um 409.
            const podeEntregar = licenca.livres > 0
              && licenca.status !== 'ENCERRADA' && licenca.status !== 'EXPIRADA';

            return (
              <tr key={licenca.id} className="border-b border-border-sutil/50 last:border-0 hover:bg-bg-base/40 transition-colors">
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => onAbrir(licenca)}
                    className="text-text-primary hover:text-status-success transition-colors text-left"
                  >
                    {licenca.name}
                  </button>
                  <div className="text-[10px] text-text-tertiary mt-1">
                    {licenca.manufacturer?.name ?? licenca.category?.name ?? '—'}
                    {!licenca.reassignable && (
                      // O aviso precisa estar na LISTAGEM, não só no detalhe:
                      // é ele que explica por que a devolução vai pedir
                      // confirmação, antes de alguém clicar.
                      <span className="ml-2 text-status-warning">· não reatribuível</span>
                    )}
                  </div>
                </td>

                <td className="px-4 py-3">
                  <span style={{ color: corDoStatus(licenca.status) }}>{licenca.status}</span>
                </td>

                <td className="px-4 py-3 text-right">
                  <span style={{ color: corDosAssentos(licenca) }}>{licenca.livres}</span>
                  <span className="text-text-tertiary"> / {licenca.seatsTotal}</span>
                  {/* Queimado e aposentado explicam a diferença entre o que foi
                      comprado e o que ainda dá para usar. Sem eles, "3 / 10"
                      com 7 ocupados não fecha a conta na cabeça de ninguém. */}
                  {(licenca.queimados > 0 || licenca.aposentados > 0) && (
                    <div className="text-[10px] text-text-tertiary mt-1">
                      {licenca.queimados > 0 && <span className="text-status-danger">{licenca.queimados} queimado(s) </span>}
                      {licenca.aposentados > 0 && <span>{licenca.aposentados} aposentado(s)</span>}
                    </div>
                  )}
                </td>

                <td className="px-4 py-3 text-text-secondary">
                  {textoDoPrazo(licenca.diasParaVencer)}
                </td>

                <td className="px-4 py-3">
                  {/* A listagem NUNCA traz a máscara (só o detalhe traz) —
                      aqui vale apenas se existe chave. */}
                  {licenca.hasProductKey
                    ? <KeyRound size={12} className="text-status-success" />
                    : <span className="text-text-tertiary">—</span>}
                </td>

                <td className="px-4 py-3 text-right text-text-secondary">
                  {formatarMoeda(licenca.purchaseCost)}
                </td>

                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    {naLixeira ? (
                      <button
                        type="button"
                        onClick={() => onRestaurar(licenca)}
                        title="Restaurar"
                        className="p-1.5 text-text-tertiary hover:text-status-success transition-colors"
                      >
                        <RotateCcw size={14} />
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => onEntregar(licenca)}
                          disabled={!podeEntregar}
                          title={podeEntregar ? 'Entregar assento' : 'Sem assento livre ou contrato encerrado'}
                          className="p-1.5 text-text-tertiary hover:text-status-success transition-colors disabled:opacity-30 disabled:hover:text-text-tertiary"
                        >
                          <UserPlus size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => onEditar(licenca)}
                          title="Editar"
                          className="p-1.5 text-text-tertiary hover:text-text-primary transition-colors"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => onExcluir(licenca)}
                          title="Mover para a lixeira"
                          className="p-1.5 text-text-tertiary hover:text-status-danger transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
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
