import { useState } from 'react';
import { KeyRound, Laptop, User } from 'lucide-react';
import ChaveEscondida from './ChaveEscondida';
import type { EntregaComChave } from '../../../domain/shared/license.types';
import { diaDoInstante, formatarDiaDoInstante, hojeNoCampoDeData } from '../../helpers/format.helper';

// QUEM ESTÁ COM A LICENÇA AGORA — uma linha por entrega aberta, com a chave
// dela e o botão de devolver. Sem número de vaga (AA): a pergunta é "com
// quem", não "qual vaga".
//
// DEVOLVER PEDE O DIA, na própria linha: vem com hoje e pode voltar até o dia
// da entrega — o registro da devolução que já aconteceu. É o único lugar do
// sistema que devolve licença; as outras telas mostram e apontam para cá.
//
// A CHAVE da entrega aparece escondida, e se troca aqui também — só a chave.

interface EntregasAbertasProps {
  entregas: EntregaComChave[];
  /** A frase da lista vazia quando ela é vazia por causa da busca. */
  vazio?: string;
  ocupado: boolean;
  /**
   * `checkinAt` é o dia, 'AAAA-MM-DD'. Resolve `true` quando a devolução deu
   * certo — só então a linha fecha, e a recusa deixa o dia escolhido no campo.
   */
  onDevolver: (checkoutId: string, checkinAt: string) => Promise<boolean>;
  /** Resolve `true` quando a troca deu certo — só então a linha sai da edição. */
  onTrocarChave: (checkoutId: string, productKey: string | null) => Promise<boolean>;
}

/** O que uma linha está pedindo agora: nada, o dia da devolução, ou a chave nova. */
type Pedido = { id: string; tipo: 'devolver' | 'chave'; valor: string } | null;

const BOTAO = 'px-3 py-1 border border-border-sutil uppercase tracking-widest text-[10px] text-text-secondary hover:text-text-primary transition-colors disabled:opacity-40';
const CAMPO = 'p-1 bg-bg-base border border-border-sutil text-text-primary normal-case tracking-normal focus:outline-none focus:border-text-secondary';

function alvoEmTexto(entrega: EntregaComChave): string {
  if (entrega.assignedPerson) return entrega.assignedPerson.name;
  const ativo = entrega.assignedAsset;
  if (!ativo) return '—';
  return ativo.name ? `${ativo.assetTag} — ${ativo.name}` : ativo.assetTag;
}

export default function EntregasAbertas({ entregas, vazio, ocupado, onDevolver, onTrocarChave }: EntregasAbertasProps) {
  // Um pedido aberto de cada vez, na linha que o abriu.
  const [pedido, setPedido] = useState<Pedido>(null);

  if (entregas.length === 0) {
    return <p className="text-text-tertiary">{vazio ?? 'Ninguém está com esta licença agora.'}</p>;
  }

  const hoje = hojeNoCampoDeData();

  const salvarChave = async (checkoutId: string, valor: string) => {
    if (await onTrocarChave(checkoutId, valor.trim() || null)) setPedido(null);
  };

  const confirmarDevolucao = async (checkoutId: string, dia: string) => {
    if (await onDevolver(checkoutId, dia)) setPedido(null);
  };

  return (
    <ul className="divide-y divide-border-sutil/50 border border-border-sutil">
      {entregas.map((entrega) => {
        const Icone = entrega.assignedPerson ? User : Laptop;
        const meu = pedido?.id === entrega.id ? pedido : null;
        return (
          <li key={entrega.id} className="px-3 py-2 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0 space-y-0.5">
                <div className="flex items-center gap-2 text-text-primary">
                  <Icone size={12} className="text-text-tertiary shrink-0" />
                  <span className="truncate">{alvoEmTexto(entrega)}</span>
                </div>
                <div className="text-[10px] text-text-tertiary">
                  desde {formatarDiaDoInstante(entrega.checkoutAt)}
                  {entrega.checkoutNotes && <span className="text-text-secondary"> · {entrega.checkoutNotes}</span>}
                </div>
              </div>

              {meu?.tipo === 'devolver' ? (
                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-2 text-[10px] text-text-tertiary uppercase tracking-widest">
                    Devolvida em
                    <input
                      type="date"
                      value={meu.valor}
                      min={diaDoInstante(entrega.checkoutAt)}
                      max={hoje}
                      onChange={(evento) => setPedido({ ...meu, valor: evento.target.value })}
                      className={CAMPO}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => void confirmarDevolucao(entrega.id, meu.valor)}
                    disabled={ocupado || meu.valor === ''}
                    className={BOTAO}
                  >
                    Confirmar
                  </button>
                  <button type="button" onClick={() => setPedido(null)} className={BOTAO}>Cancelar</button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setPedido({ id: entrega.id, tipo: 'chave', valor: entrega.productKey ?? '' })}
                    disabled={ocupado}
                    className={BOTAO}
                  >
                    Chave
                  </button>
                  <button
                    type="button"
                    onClick={() => setPedido({ id: entrega.id, tipo: 'devolver', valor: hoje })}
                    disabled={ocupado}
                    className={BOTAO}
                  >
                    Devolver
                  </button>
                </div>
              )}
            </div>

            {meu?.tipo === 'chave' ? (
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={meu.valor}
                  onChange={(evento) => setPedido({ ...meu, valor: evento.target.value })}
                  placeholder="Vazia na licença de volume"
                  aria-label="Chave desta entrega"
                  className={`${CAMPO} flex-1 min-w-[220px] font-mono`}
                />
                <button type="button" onClick={() => void salvarChave(entrega.id, meu.valor)} disabled={ocupado} className={BOTAO}>
                  Salvar
                </button>
                <button type="button" onClick={() => setPedido(null)} className={BOTAO}>Cancelar</button>
              </div>
            ) : entrega.productKey && (
              <div className="flex items-start gap-2 text-[10px]">
                <KeyRound size={11} className="text-text-tertiary mt-0.5 shrink-0" />
                <ChaveEscondida chave={entrega.productKey} />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
