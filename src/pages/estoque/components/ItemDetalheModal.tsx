import { Undo2, X } from 'lucide-react';
import {
  useAccessoryCheckoutsQuery, useStockMovementsQuery,
} from '../../../domain/stock/stock.queries';
import { deltaLegivel, rotuloDoMovimento } from '../helpers/estoque.helper';
import { momentoDoEvento } from '../../helpers/historico.helper';
import type { AbaDeEstoque } from '../helpers/estoque.helper';
import type { ItemDeEstoque } from '../../../domain/shared/stock.types';

// O DETALHE DE UM ITEM: quem está com as unidades, e tudo que já aconteceu.
//
// A MOVIMENTAÇÃO É A UNIÃO DE DUAS FONTES, feita pelo SERVIDOR na leitura: as
// tabelas de saída respondem *para onde a unidade foi*, o `StockLog` responde
// *por que a quantidade nominal mudou*. Não existe uma terceira tabela que
// guarde as duas — ela seria uma segunda contagem do mesmo fato, e as duas
// divergiriam no primeiro caminho que esquecesse de escrever numa delas.
//
// Este é o único componente da pasta que busca dado, pelo mesmo motivo do
// `ReferenceSelect`: as duas consultas só fazem sentido com um item aberto, e
// declará-las no hook da página as deixaria ligadas o tempo todo. Continua sem
// falar HTTP — usa a query do domínio.

interface ItemDetalheModalProps {
  aba: AbaDeEstoque;
  item: ItemDeEstoque;
  onClose: () => void;
  onDevolver: (checkoutId: string) => Promise<void>;
}

const CABECALHO = 'px-3 py-2 text-left text-[10px] uppercase tracking-widest text-text-tertiary font-normal';

export default function ItemDetalheModal({ aba, item, onClose, onDevolver }: ItemDetalheModalProps) {
  const { data: movimentos, isPending } = useStockMovementsQuery(aba.slug, item.id);
  // Só o acessório tem "unidades fora que podem voltar": o consumível não volta
  // (D37) e o componente se retira pela tela do ATIVO, onde ele está.
  const { data: entregas } = useAccessoryCheckoutsQuery(
    aba.kind === 'ACCESSORY' ? item.id : null,
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-bg-base/80 backdrop-blur-sm">
      <div className="relative w-full max-w-3xl bg-surface-card border border-border-sutil shadow-2xl flex flex-col max-h-[85vh]">

        <div className="flex items-center justify-between px-6 py-4 border-b border-border-sutil bg-bg-base/50 shrink-0">
          <div>
            <h2 className="text-sm font-mono text-text-primary tracking-widest uppercase">{item.name}</h2>
            <p className="font-mono text-[10px] text-text-tertiary mt-1 tabular-nums">
              {item.disponivel} de {item.qty} disponíveis · {item.emUso} fora
              {item.minQty !== null && <> · mínimo {item.minQty}</>}
              {item.category && <> · {item.category.name}</>}
            </p>
          </div>
          <button onClick={onClose} className="p-2 text-text-tertiary hover:text-text-primary transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="p-6 font-mono text-xs space-y-6 overflow-y-auto">

          {aba.kind === 'ACCESSORY' && (
            <section className="space-y-2">
              <h3 className="text-[10px] uppercase tracking-widest text-text-secondary">
                Unidades fora do estoque
              </h3>

              {(entregas ?? []).length === 0 ? (
                <p className="text-text-tertiary">Nenhuma unidade entregue.</p>
              ) : (
                <table className="w-full">
                  <thead className="border-b border-border-sutil">
                    <tr>
                      <th className={CABECALHO}>Com quem</th>
                      <th className={CABECALHO}>Desde</th>
                      <th className={CABECALHO}>Devolver até</th>
                      <th className={`${CABECALHO} text-right`}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {(entregas ?? []).map((entrega) => (
                      <tr key={entrega.id} className="border-b border-border-sutil/50 last:border-0">
                        <td className="px-3 py-2 text-text-primary">
                          {entrega.targetUser?.name ?? entrega.targetLocation?.name ?? '—'}
                          <span className="ml-2 text-[10px] text-text-tertiary uppercase tracking-widest">
                            {entrega.targetType === 'LOCATION' ? 'posto' : 'pessoa'}
                          </span>
                          {entrega.targetType === 'LOCATION' && (
                            // Quem responde por ela são os OCUPANTES do posto —
                            // vários, pela MESMA unidade (D33). Dizer isso aqui
                            // evita a leitura de que a mesa "tem" o mouse sem
                            // ninguém respondendo.
                            <div className="text-[10px] text-text-tertiary">
                              respondem os ocupantes do posto
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2 text-text-secondary">{momentoDoEvento(entrega.checkedOutAt)}</td>
                        <td className="px-3 py-2 text-text-secondary">
                          {entrega.expectedCheckinAt ? momentoDoEvento(entrega.expectedCheckinAt) : '—'}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button
                            type="button"
                            title="Devolver esta unidade"
                            onClick={() => void onDevolver(entrega.id)}
                            className="p-2 text-text-tertiary hover:text-status-success transition-colors"
                          >
                            <Undo2 size={13} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          )}

          <section className="space-y-2">
            <h3 className="text-[10px] uppercase tracking-widest text-text-secondary">Movimentação</h3>
            <p className="text-text-tertiary text-[10px] leading-relaxed">
              As saídas e os ajustes na mesma linha do tempo — duas fontes unidas na leitura, não
              uma terceira tabela.
            </p>

            {isPending ? (
              <p className="text-text-tertiary">Carregando…</p>
            ) : (movimentos ?? []).length === 0 ? (
              <p className="text-text-tertiary">Nada aconteceu com este item ainda.</p>
            ) : (
              <table className="w-full">
                <thead className="border-b border-border-sutil">
                  <tr>
                    <th className={CABECALHO}>Quando</th>
                    <th className={CABECALHO}>O quê</th>
                    <th className={`${CABECALHO} text-right`}>Unidades</th>
                    <th className={CABECALHO}>Quem / motivo</th>
                    <th className={CABECALHO}>Observações</th>
                  </tr>
                </thead>
                <tbody>
                  {(movimentos ?? []).map((movimento) => (
                    <tr key={movimento.id} className="border-b border-border-sutil/50 last:border-0">
                      <td className="px-3 py-2 text-text-tertiary whitespace-nowrap">
                        {momentoDoEvento(movimento.at)}
                      </td>
                      <td className="px-3 py-2 text-text-primary">{rotuloDoMovimento(movimento)}</td>
                      <td
                        className="px-3 py-2 text-right tabular-nums"
                        style={{ color: movimento.qty > 0 ? '#22c55e' : '#f59e0b' }}
                      >
                        {deltaLegivel(movimento.qty)}
                      </td>
                      <td className="px-3 py-2 text-text-secondary">{movimento.rotulo ?? '—'}</td>
                      <td className="px-3 py-2 text-text-tertiary">{movimento.notes ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
