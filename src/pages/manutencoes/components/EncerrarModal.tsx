import { useState } from 'react';
import { CheckCircle2, X } from 'lucide-react';
import type { EncerramentoInput, Manutencao } from '../../../domain/shared/lifecycle.types';
import { formatarData } from '../../helpers/format.helper';

// O ENCERRAMENTO — janela própria, e o custo entra AQUI.
//
// É no encerramento que o valor final se conhece: a nota do fornecedor chega com
// o serviço pronto. Pedir um PUT depois do clique faria o operador fechar sem
// custo e quase nunca voltar — e o relatório de manutenção passaria a somar o que
// alguém lembrou de editar, não o que foi gasto.
//
// A data padrão é HOJE, e o servidor a aplica quando o campo vem vazio: o caso
// comum é "acabou agora", e digitar a data de novo é atrito sem informação.

interface Props {
  manutencao: Manutencao;
  onClose: () => void;
  onSubmit: (dados: EncerramentoInput) => Promise<void>;
}

const ROTULO = 'block text-[10px] uppercase tracking-widest text-text-tertiary mb-1';
const CAMPO = 'w-full p-2 bg-bg-base border border-border-sutil text-text-primary focus:outline-none focus:border-text-secondary transition-colors';

export default function EncerrarModal({ manutencao, onClose, onSubmit }: Props) {
  const [completionDate, setCompletionDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [cost, setCost] = useState(() => manutencao.cost ?? '');
  const [notes, setNotes] = useState(() => manutencao.notes ?? '');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const handleSubmit = async (evento: React.FormEvent) => {
    evento.preventDefault();
    setErro(null);
    setSalvando(true);

    try {
      await onSubmit({
        completionDate: completionDate || null,
        cost: cost.trim() || null,
        notes: notes.trim() || null,
      });
    } catch (falha) {
      // O 422 de "encerramento antes da abertura" e o 409 de "já encerrada" (duas
      // abas na mesma lista) aparecem aqui, com a frase do servidor.
      setErro((falha as Error).message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-surface-card border border-border-sutil w-full max-w-lg font-mono text-xs">

        <div className="flex items-center justify-between px-6 py-4 border-b border-border-sutil">
          <h3 className="flex items-center gap-2 text-sm uppercase tracking-widest text-text-primary">
            <CheckCircle2 size={14} /> Encerrar manutenção
          </h3>
          <button type="button" onClick={onClose} className="text-text-tertiary hover:text-text-primary transition-colors">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={(evento) => void handleSubmit(evento)} className="p-6 space-y-4">
          <div className="border border-border-sutil bg-bg-base/40 px-3 py-2 space-y-1">
            <div className="text-text-primary">{manutencao.title}</div>
            <div className="text-[10px] text-text-tertiary">
              {manutencao.asset.assetTag} · aberta em {formatarData(manutencao.startDate)}
              {manutencao.diasEmAberto !== null && <> · há {manutencao.diasEmAberto} dia(s)</>}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={ROTULO}>Encerrada em *</label>
              <input
                required
                type="date"
                value={completionDate}
                onChange={(evento) => setCompletionDate(evento.target.value)}
                className={CAMPO}
              />
            </div>

            <div>
              <label className={ROTULO}>Custo final</label>
              <input
                value={cost}
                onChange={(evento) => setCost(evento.target.value)}
                placeholder="350.00"
                inputMode="decimal"
                className={CAMPO}
              />
            </div>
          </div>

          <div>
            <label className={ROTULO}>Observações</label>
            <textarea
              rows={3}
              value={notes}
              onChange={(evento) => setNotes(evento.target.value)}
              placeholder="O que foi feito, peça trocada, número da OS…"
              className={`${CAMPO} resize-y`}
            />
          </div>

          {erro && (
            <div className="border border-status-danger/40 bg-status-danger/10 text-status-danger px-3 py-2">
              {erro}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-border-sutil text-text-tertiary hover:text-text-primary uppercase tracking-widest text-[10px] transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={salvando}
              className="px-4 py-2 bg-text-primary text-bg-base hover:bg-text-secondary uppercase tracking-widest text-[10px] transition-colors disabled:opacity-40"
            >
              {salvando ? 'Encerrando…' : 'Encerrar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
