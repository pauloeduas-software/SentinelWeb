import { useState } from 'react';
import { KeyRound, Laptop, User } from 'lucide-react';
import ChaveEscondida from './ChaveEscondida';
import type { ChaveDaLicenca, EntregaComChave } from '../../../types/license.types';
import { diaDoInstante, formatarDiaDoInstante, hojeNoCampoDeData } from '../../../helpers/format.helper';
import { chavesComLugar, lugarDaChave, rotuloDaChave } from '../helpers/licenca.helper';

// QUEM ESTÁ COM A LICENÇA AGORA — uma linha por entrega aberta, com a chave
// dela e o botão de devolver. Sem número de vaga (AA): a pergunta é "com
// quem", não "qual vaga".
//
// DEVOLVER PEDE O DIA, na própria linha: vem com hoje e pode voltar até o dia
// da entrega — o registro da devolução que já aconteceu. É o único lugar do
// sistema que devolve licença; as outras telas mostram e apontam para cá.
//
// A CHAVE da entrega aparece escondida, com a posição dela na lista da licença,
// e se troca aqui também — por outra da lista (AC). É também como a entrega
// feita antes de a licença ter chaves ganha a sua.

interface EntregasAbertasProps {
  entregas: EntregaComChave[];
  /** As chaves da licença, do detalhe. Vazia, a entrega não tem chave para trocar. */
  chaves: ChaveDaLicenca[];
  /** A frase da lista vazia quando ela é vazia por causa da busca. */
  vazio?: string;
  ocupado: boolean;
  /**
   * `checkinAt` é o dia, 'AAAA-MM-DD'. Resolve `true` quando a devolução deu
   * certo — só então a linha fecha, e a recusa deixa o dia escolhido no campo.
   */
  onDevolver: (checkoutId: string, checkinAt: string) => Promise<boolean>;
  /** Resolve `true` quando a troca deu certo — só então a linha sai da edição. */
  onTrocarChave: (checkoutId: string, licenseKeyId: string) => Promise<boolean>;
}

/** O que uma linha está pedindo agora: nada, o dia da devolução, ou a chave nova (o id). */
type Pedido = { id: string; tipo: 'devolver' | 'chave'; valor: string } | null;

const BOTAO = 'px-3 py-1 border border-border-sutil uppercase tracking-widest text-[10px] text-text-secondary hover:text-text-primary transition-colors disabled:opacity-40';
const CAMPO = 'p-1 bg-bg-base border border-border-sutil text-text-primary normal-case tracking-normal focus:outline-none focus:border-text-secondary';

function alvoEmTexto(entrega: EntregaComChave): string {
  if (entrega.assignedPerson) return entrega.assignedPerson.name;
  const ativo = entrega.assignedAsset;
  if (!ativo) return '—';
  return ativo.name ? `${ativo.assetTag} — ${ativo.name}` : ativo.assetTag;
}

export default function EntregasAbertas({ entregas, chaves, vazio, ocupado, onDevolver, onTrocarChave }: EntregasAbertasProps) {
  // Um pedido aberto de cada vez, na linha que o abriu.
  const [pedido, setPedido] = useState<Pedido>(null);

  if (entregas.length === 0) {
    return <p className="text-text-tertiary">{vazio ?? 'Ninguém está com esta licença agora.'}</p>;
  }

  const hoje = hojeNoCampoDeData();

  const salvarChave = async (checkoutId: string, licenseKeyId: string) => {
    if (await onTrocarChave(checkoutId, licenseKeyId)) setPedido(null);
  };

  const comLugar = chavesComLugar(chaves);
  const posicaoDa = (licenseKeyId: string | null) => chaves.findIndex((chave) => chave.id === licenseKeyId) + 1;

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
                  {chaves.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setPedido({ id: entrega.id, tipo: 'chave', valor: entrega.licenseKeyId ?? '' })}
                      disabled={ocupado}
                      className={BOTAO}
                    >
                      Chave
                    </button>
                  )}
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
                {/* A chave atual e as que têm lugar. */}
                <select
                  value={meu.valor}
                  onChange={(evento) => setPedido({ ...meu, valor: evento.target.value })}
                  aria-label="Chave desta entrega"
                  className={`${CAMPO} flex-1 min-w-[220px] font-mono`}
                >
                  {!entrega.licenseKeyId && <option value="">Escolha a chave…</option>}
                  {chaves.map((chave, indice) => (chave.id === entrega.licenseKeyId || comLugar.includes(chave)) && (
                    <option key={chave.id} value={chave.id}>
                      {rotuloDaChave(chave, indice + 1)}
                      {chave.id === entrega.licenseKeyId ? ' — a atual' : ` — ${lugarDaChave(chave)}`}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => void salvarChave(entrega.id, meu.valor)}
                  disabled={ocupado || meu.valor === '' || meu.valor === entrega.licenseKeyId}
                  className={BOTAO}
                >
                  Salvar
                </button>
                <button type="button" onClick={() => setPedido(null)} className={BOTAO}>Cancelar</button>
              </div>
            ) : entrega.licenseKey ? (
              <div className="flex items-start gap-2 text-[10px]">
                <KeyRound size={11} className="text-text-tertiary mt-0.5 shrink-0" />
                {posicaoDa(entrega.licenseKeyId) > 0 && (
                  <span className="text-text-tertiary shrink-0">{posicaoDa(entrega.licenseKeyId)}.</span>
                )}
                <ChaveEscondida chave={entrega.licenseKey.productKey} />
              </div>
            ) : chaves.length > 0 && (
              <div className="flex items-center gap-2 text-[10px] text-text-tertiary">
                <KeyRound size={11} className="shrink-0" /> sem chave — use Chave para escolher uma
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
