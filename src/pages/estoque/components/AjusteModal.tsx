import { useState } from 'react';
import { PackageMinus, PackagePlus, X } from 'lucide-react';
import type { AjustarEstoqueInput, ItemDeEstoque } from '../../../domain/shared/stock.types';

// ENTRADA E BAIXA — a única porta para o total do item.
//
// `qty` É DELTA, não o valor final: "chegou nota com 10" ou "quebraram 2", não
// "agora são 42". O servidor aplica `increment`/`decrement` dentro da trava da
// linha (`server/domain/stock/use-cases/adjust-stock.usecase.ts`).

const CLASSE_CAMPO =
  'w-full p-2 bg-bg-base border border-border-sutil text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-text-secondary transition-colors';

const ROTULO = 'text-text-secondary uppercase tracking-widest text-[10px]';

interface AjusteModalProps {
  item: ItemDeEstoque;
  onClose: () => void;
  onSubmit: (data: AjustarEstoqueInput) => Promise<void>;
}

export default function AjusteModal({ item, onClose, onSubmit }: AjusteModalProps) {
  const [kind, setKind] = useState<'ENTRADA' | 'BAIXA'>('ENTRADA');
  const [qty, setQty] = useState('1');
  const [notes, setNotes] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  const enviar = async (event: React.FormEvent) => {
    event.preventDefault();
    setSalvando(true);
    setErro('');

    try {
      await onSubmit({ kind, qty: Number(qty) || 0, notes: notes.trim() || null });
    } catch (falha) {
      // O 409 de baixa que deixaria o total abaixo do que está fora.
      setErro((falha as Error).message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-bg-base/80 backdrop-blur-sm">
      <div className="relative w-full max-w-md bg-surface-card border border-border-sutil shadow-2xl flex flex-col">

        <div className="flex items-center justify-between px-6 py-4 border-b border-border-sutil bg-bg-base/50">
          <div>
            <h2 className="text-sm font-mono text-text-primary tracking-widest uppercase">Entrada ou baixa</h2>
            <p className="font-mono text-[10px] text-text-tertiary mt-1">
              {item.name} · {item.qty} no total, {item.disponivel} disponível
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

          <div className="flex border border-border-sutil w-fit">
            {([['ENTRADA', 'Entrada', PackagePlus], ['BAIXA', 'Baixa', PackageMinus]] as const).map(([valor, rotulo, Icone]) => (
              <button
                key={valor}
                type="button"
                onClick={() => setKind(valor)}
                className={`flex items-center gap-2 px-4 py-2 uppercase tracking-widest transition-colors ${
                  kind === valor
                    ? 'bg-text-primary text-bg-base'
                    : 'text-text-tertiary hover:text-text-primary hover:bg-bg-base'
                }`}
              >
                <Icone size={12} /> {rotulo}
              </button>
            ))}
          </div>

          <label className="space-y-1.5 block">
            <span className={ROTULO}>Quantidade *</span>
            <input
              required type="number" min={1} value={qty}
              onChange={(e) => setQty(e.target.value)} className={CLASSE_CAMPO}
            />
            <span className="block text-[10px] text-text-tertiary leading-relaxed">
              {kind === 'ENTRADA'
                ? 'Chegou nota, ou recontagem para cima: soma ao total.'
                : 'Quebrou, perdeu, ou recontagem para baixo: subtrai do total. Recusada se deixar o total abaixo do que está fora.'}
            </span>
          </label>

          <label className="space-y-1.5 block">
            <span className={ROTULO}>Observações</span>
            <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className={CLASSE_CAMPO} />
          </label>

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 border border-border-sutil text-text-tertiary hover:text-text-primary uppercase tracking-widest transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={salvando} className="px-4 py-2 bg-text-primary text-bg-base hover:bg-text-secondary uppercase tracking-widest transition-colors disabled:opacity-50">
              {salvando ? 'Salvando…' : 'Confirmar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
