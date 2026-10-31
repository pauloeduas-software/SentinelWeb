import { useState } from 'react';
import { Armchair, Monitor, User } from 'lucide-react';
import type { EntregaAberta } from '../../../types/stock.types';
import { diaDoInstante, formatarDiaDoInstante, hojeNoCampoDeData } from '../../../helpers/format.helper';
import { textoDeUnidades } from '../../../helpers/estoque.helper';

// QUEM ESTÁ COM O ITEM AGORA — uma linha por ENTREGA ("Mesa 1 · 5 unidades ·
// desde…"), com o botão de devolver. É o "Com quem está" da licença
// (`EntregasAbertas.tsx`), com quantidade.
//
// DEVOLVER PERGUNTA QUANTAS E O DIA, na própria linha: vem com todas e com
// hoje; voltam menos quando só parte voltou, e o dia pode voltar até o da
// entrega — o registro da devolução que já aconteceu. É o único lugar do
// sistema que devolve estoque; as fichas mostram e apontam para cá.
//
// No COMPONENTE (AI), a linha é o computador e o botão é RETIRAR: a peça sai da
// máquina e volta ao disponível. A pergunta é a mesma, quantas e o dia.

interface EntregasAbertasProps {
  entregas: EntregaAberta[];
  /** A frase da lista vazia quando ela é vazia por causa da busca. */
  vazio?: string;
  ocupado: boolean;
  /**
   * `checkinAt` é o dia, 'AAAA-MM-DD'. Resolve `true` quando a devolução deu
   * certo — só então a linha fecha, e a recusa deixa o que foi escolhido nos campos.
   */
  onDevolver: (entregaId: string, qty: number, checkinAt: string) => Promise<boolean>;
}

/** O que a linha aberta está pedindo: quantas e o dia. */
type Pedido = { id: string; qty: string; dia: string } | null;

const ICONE_DO_ALVO = { PERSON: User, WORKSTATION: Armchair, ASSET: Monitor } as const;

const BOTAO = 'px-3 py-1 border border-border-sutil uppercase tracking-widest text-[10px] text-text-secondary hover:text-text-primary transition-colors disabled:opacity-40';
const CAMPO = 'p-1 bg-bg-base border border-border-sutil text-text-primary normal-case tracking-normal focus:outline-none focus:border-text-secondary';

export default function EntregasAbertas({ entregas, vazio, ocupado, onDevolver }: EntregasAbertasProps) {
  // Um pedido aberto de cada vez, na linha que o abriu.
  const [pedido, setPedido] = useState<Pedido>(null);

  if (entregas.length === 0) {
    return <p className="text-text-tertiary">{vazio ?? 'Ninguém está com este item agora.'}</p>;
  }

  const hoje = hojeNoCampoDeData();

  const confirmar = async (entrega: EntregaAberta, meu: NonNullable<Pedido>) => {
    if (await onDevolver(entrega.id, Number(meu.qty), meu.dia)) setPedido(null);
  };

  return (
    <ul className="divide-y divide-border-sutil/50 border border-border-sutil">
      {entregas.map((entrega) => {
        const Icone = ICONE_DO_ALVO[entrega.targetType];
        const componente = entrega.targetType === 'ASSET';
        const meu = pedido?.id === entrega.id ? pedido : null;
        const quantas = meu ? Number(meu.qty) : 0;
        const quantasValem = meu !== null && meu.qty.trim() !== '' && Number.isInteger(quantas)
          && quantas >= 1 && quantas <= entrega.unidades;

        return (
          <li key={entrega.id} className="px-3 py-2 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 space-y-0.5">
              <div className="flex items-center gap-2 text-text-primary">
                <Icone size={12} className="text-text-tertiary shrink-0" />
                <span className="truncate">{entrega.targetLabel}</span>
                <span className="text-text-secondary shrink-0">· {textoDeUnidades(entrega.unidades)}</span>
              </div>
              <div className="text-[10px] text-text-tertiary">
                desde {formatarDiaDoInstante(entrega.checkoutAt)}
                {entrega.notes && <span className="text-text-secondary"> · {entrega.notes}</span>}
              </div>
            </div>

            {meu ? (
              <div className="flex flex-wrap items-center gap-2">
                {/* Com uma unidade só, não há o que perguntar. */}
                {entrega.unidades > 1 && (
                  <label className="flex items-center gap-2 text-[10px] text-text-tertiary uppercase tracking-widest">
                    Quantas
                    <input
                      type="number"
                      value={meu.qty}
                      min={1}
                      max={entrega.unidades}
                      onChange={(evento) => setPedido({ ...meu, qty: evento.target.value })}
                      className={`${CAMPO} w-16`}
                    />
                  </label>
                )}
                <label className="flex items-center gap-2 text-[10px] text-text-tertiary uppercase tracking-widest">
                  {componente ? 'Retirada em' : 'Devolvida em'}
                  <input
                    type="date"
                    value={meu.dia}
                    min={diaDoInstante(entrega.checkoutAt)}
                    max={hoje}
                    onChange={(evento) => setPedido({ ...meu, dia: evento.target.value })}
                    className={CAMPO}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => void confirmar(entrega, meu)}
                  disabled={ocupado || meu.dia === '' || !quantasValem}
                  title={quantasValem ? 'Confirmar' : `De 1 a ${entrega.unidades}`}
                  className={BOTAO}
                >
                  Confirmar
                </button>
                <button type="button" onClick={() => setPedido(null)} className={BOTAO}>Cancelar</button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setPedido({ id: entrega.id, qty: String(entrega.unidades), dia: hoje })}
                disabled={ocupado}
                className={BOTAO}
              >
                {componente ? 'Retirar' : 'Devolver'}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
