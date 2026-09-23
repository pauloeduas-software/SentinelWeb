import { useState } from 'react';
import { X } from 'lucide-react';
import { MOTIVOS_DO_AJUSTE } from '../helpers/estoque.helper';
import type { AjusteInput } from '../../../domain/stock/stock.queries';
import type { ItemDeEstoque, MotivoDoAjuste } from '../../../domain/shared/stock.types';

// O AJUSTE DE ESTOQUE — a única porta para a quantidade.
//
// ─────────────────────────────────────────────────────────────────────────────
// O CAMPO É O DELTA, NÃO O VALOR FINAL. "A quantidade agora é 42" é
// ler-e-depois-escrever com outro nome: duas recontagens simultâneas gravariam
// números calculados a partir do mesmo estado antigo, e uma sumiria sem erro.
// O delta vai para um `increment` que o Postgres resolve na linha travada.
//
// A tela mostra a CONTA ("5 → 15") para o operador não ter que fazê-la de
// cabeça — que é o argumento a favor do valor final, atendido sem o defeito
// dele.
// ─────────────────────────────────────────────────────────────────────────────

const CLASSE_CAMPO =
  'w-full p-2 bg-bg-base border border-border-sutil text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-text-secondary transition-colors';

const ROTULO = 'text-text-secondary uppercase tracking-widest text-[10px]';

interface AjusteModalProps {
  item: ItemDeEstoque;
  onClose: () => void;
  onSubmit: (dados: AjusteInput) => Promise<void>;
}

export default function AjusteModal({ item, onClose, onSubmit }: AjusteModalProps) {
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState<MotivoDoAjuste>('COMPRA');
  const [notes, setNotes] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  const numero = Number(delta);
  const valido = delta.trim() !== '' && Number.isInteger(numero) && numero !== 0;
  const novaQty = item.qty + (valido ? numero : 0);
  // O que o servidor recusa com 409: baixar abaixo do que já saiu deixaria o
  // disponível negativo por decisão do sistema, e não por inconsistência de
  // contagem. A tela avisa antes para a recusa não ser uma surpresa.
  const abaixoDoQueSaiu = valido && novaQty < item.emUso;

  const enviar = async (event: React.FormEvent) => {
    event.preventDefault();
    setSalvando(true);
    setErro('');

    try {
      await onSubmit({ delta: numero, reason, ...(notes.trim() ? { notes: notes.trim() } : {}) });
    } catch (falha) {
      setErro((falha as Error).message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-bg-base/80 backdrop-blur-sm">
      <div className="relative w-full max-w-lg bg-surface-card border border-border-sutil shadow-2xl flex flex-col">

        <div className="flex items-center justify-between px-6 py-4 border-b border-border-sutil bg-bg-base/50">
          <div>
            <h2 className="text-sm font-mono text-text-primary tracking-widest uppercase">Ajustar quantidade</h2>
            <p className="font-mono text-[10px] text-text-tertiary mt-1">
              {item.name} · {item.qty} cadastrada(s), {item.emUso} fora do estoque
            </p>
          </div>
          <button onClick={onClose} className="p-2 text-text-tertiary hover:text-text-primary transition-colors">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={enviar} className="p-6 font-mono text-xs space-y-4">
          {erro && (
            <div className="p-3 bg-status-danger/10 text-status-danger border border-status-danger/20">{erro}</div>
          )}

          <div className="space-y-1">
            <label className={ROTULO}>Quanto somar*</label>
            <input
              required
              type="number"
              value={delta}
              onChange={(event) => setDelta(event.target.value)}
              placeholder="10 para entrada, -3 para baixa"
              className={CLASSE_CAMPO}
            />
            {valido && (
              <p className="text-text-secondary text-[10px] pt-1 tabular-nums">
                {item.qty} → <span className="text-text-primary">{novaQty}</span>
                {' '}· disponível ficaria em {novaQty - item.emUso}
              </p>
            )}
          </div>

          {abaixoDoQueSaiu && (
            <div className="p-3 border border-status-danger/30 bg-status-danger/10 text-status-danger text-[10px] leading-relaxed">
              {item.emUso} unidade(s) deste item estão fora do estoque. Baixar para {novaQty} vai
              ser recusado — devolva o que está na rua antes.
            </div>
          )}

          <div className="space-y-1">
            <label className={ROTULO}>Motivo*</label>
            <select
              value={reason}
              onChange={(event) => setReason(event.target.value as MotivoDoAjuste)}
              className={CLASSE_CAMPO}
            >
              {MOTIVOS_DO_AJUSTE.map((motivo) => (
                <option key={motivo.valor} value={motivo.valor}>{motivo.rotulo}</option>
              ))}
            </select>
            <p className="text-text-tertiary text-[10px] leading-relaxed pt-1">
              O motivo é uma lista fechada de propósito: texto livre viraria "compra", "Compra" e
              "comprado" na mesma coluna de relatório.
            </p>
          </div>

          <div className="space-y-1">
            <label className={ROTULO}>Observações</label>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Ex: nota fiscal 1234"
              className={`${CLASSE_CAMPO} h-16 resize-none`}
            />
          </div>

          <p className="text-text-tertiary text-[10px] leading-relaxed">
            Este ajuste vira uma linha no histórico de movimentação do item, com o motivo e quem
            fez. Ele responde por que a quantidade mudou — não para onde a unidade foi, que já
            está registrado em cada entrega.
          </p>

          <div className="pt-4 flex justify-end gap-3 border-t border-border-sutil">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-border-sutil text-text-secondary hover:text-text-primary hover:bg-bg-base transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={salvando || !valido}
              className="px-4 py-2 bg-text-primary text-bg-base hover:bg-text-secondary transition-colors disabled:opacity-50"
            >
              {salvando ? 'Gravando...' : 'Ajustar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
