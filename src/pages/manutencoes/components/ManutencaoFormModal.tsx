import { useState } from 'react';
import { Wrench, X } from 'lucide-react';
import ReferenceSelect from '../../components/ReferenceSelect';
import type { Manutencao, ManutencaoInput, TipoDeManutencao } from '../../../domain/shared/lifecycle.types';
import { TIPOS_DE_MANUTENCAO } from '../../../domain/shared/lifecycle.types';
import { paraCampoDeData } from '../../helpers/format.helper';

// O FORMULÁRIO DE MANUTENÇÃO.
//
// ═════════════════════════════════════════════════════════════════════════════
// ABRIR MANUTENÇÃO NÃO MUDA O STATUS DO ATIVO, E A TELA DIZ ISSO.
//
// O aviso no rodapé não é decoração: contrato de suporte anual e upgrade
// agendado são manutenções que não tiram nada do chão, e quem preenche este
// formulário esperando que o notebook saia de "Em uso" precisa descobrir isso
// AQUI — não depois, olhando uma lista que não mudou.
// ═════════════════════════════════════════════════════════════════════════════
//
// `cost` é STRING do início ao fim: o `<input type="text">` com regex é de
// propósito. `type="number"` forçaria ponto flutuante no caminho e reintroduziria
// o centavo que a coluna `Decimal` existe para impedir.

interface Props {
  /** `null` = criação. O ativo só é escolhido na criação a partir da tela global. */
  manutencao: Manutencao | null;
  /** Fixo quando a janela abre da aba do ativo: ali o ativo já é conhecido. */
  assetIdFixo?: string;
  onClose: () => void;
  onSubmit: (assetId: string, dados: ManutencaoInput) => Promise<void>;
}

const ROTULO = 'block text-[10px] uppercase tracking-widest text-text-tertiary mb-1';
const CAMPO = 'w-full p-2 bg-bg-base border border-border-sutil text-text-primary focus:outline-none focus:border-text-secondary transition-colors';

/** Hoje em `AAAA-MM-DD`, que é o que o `<input type="date">` espera. */
function hoje(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function ManutencaoFormModal({ manutencao, assetIdFixo, onClose, onSubmit }: Props) {
  const editando = manutencao !== null;

  const [assetId, setAssetId] = useState(() => assetIdFixo ?? manutencao?.assetId ?? '');
  const [type, setType] = useState<TipoDeManutencao>(() => manutencao?.type ?? 'REPARO');
  const [title, setTitle] = useState(() => manutencao?.title ?? '');
  const [startDate, setStartDate] = useState(() => paraCampoDeData(manutencao?.startDate) || hoje());
  const [completionDate, setCompletionDate] = useState(() => paraCampoDeData(manutencao?.completionDate));
  const [cost, setCost] = useState(() => manutencao?.cost ?? '');
  const [isWarranty, setIsWarranty] = useState(() => manutencao?.isWarranty ?? false);
  const [supplierId, setSupplierId] = useState(() => manutencao?.supplierId ?? '');
  const [notes, setNotes] = useState(() => manutencao?.notes ?? '');

  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const handleSubmit = async (evento: React.FormEvent) => {
    evento.preventDefault();
    setErro(null);
    setSalvando(true);

    try {
      await onSubmit(assetId, {
        type,
        title,
        startDate,
        // `''` vira `null` (limpar o campo), e o servidor lê `null` como "apaga".
        completionDate: completionDate || null,
        cost: cost.trim() || null,
        isWarranty,
        supplierId: supplierId || null,
        notes: notes.trim() || null,
      });
    } catch (falha) {
      // A mensagem do SERVIDOR, não uma frase genérica: é por aqui que aparecem o
      // 422 de encerramento antes da abertura e o 404 de fornecedor inexistente.
      setErro((falha as Error).message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-surface-card border border-border-sutil w-full max-w-2xl max-h-[90vh] overflow-y-auto font-mono text-xs">

        <div className="flex items-center justify-between px-6 py-4 border-b border-border-sutil sticky top-0 bg-surface-card">
          <h3 className="flex items-center gap-2 text-sm uppercase tracking-widest text-text-primary">
            <Wrench size={14} /> {editando ? 'Editar manutenção' : 'Nova manutenção'}
          </h3>
          <button type="button" onClick={onClose} className="text-text-tertiary hover:text-text-primary transition-colors">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={(evento) => void handleSubmit(evento)} className="p-6 space-y-4">

          {!assetIdFixo && !editando && (
            <div>
              <label className={ROTULO}>Ativo *</label>
              <ReferenceSelect rota="assets" valor={assetId} obrigatorio onChange={setAssetId} />
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={ROTULO}>Tipo *</label>
              <select
                required
                value={type}
                onChange={(evento) => setType(evento.target.value as TipoDeManutencao)}
                className={CAMPO}
              >
                {TIPOS_DE_MANUTENCAO.map((opcao) => (
                  <option key={opcao.value} value={opcao.value}>{opcao.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className={ROTULO}>Fornecedor</label>
              <ReferenceSelect rota="suppliers" valor={supplierId} onChange={setSupplierId} />
            </div>
          </div>

          <div>
            <label className={ROTULO}>Título *</label>
            <input
              required
              value={title}
              onChange={(evento) => setTitle(evento.target.value)}
              placeholder="Troca de teclado, contrato de suporte 2027, upgrade de RAM…"
              className={CAMPO}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={ROTULO}>Abertura *</label>
              <input
                required
                type="date"
                value={startDate}
                onChange={(evento) => setStartDate(evento.target.value)}
                className={CAMPO}
              />
              <span className="text-[10px] text-text-tertiary block mt-1 leading-relaxed">
                Data futura é aceita: upgrade agendado e contrato que começa na renovação
                são manutenções legítimas.
              </span>
            </div>

            <div>
              <label className={ROTULO}>Encerramento</label>
              <input
                type="date"
                value={completionDate}
                onChange={(evento) => setCompletionDate(evento.target.value)}
                className={CAMPO}
              />
              <span className="text-[10px] text-text-tertiary block mt-1 leading-relaxed">
                Em branco significa EM ABERTO — e é isso que o alerta cobra.
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={ROTULO}>Custo</label>
              <input
                value={cost}
                onChange={(evento) => setCost(evento.target.value)}
                placeholder="350.00"
                inputMode="decimal"
                className={CAMPO}
              />
            </div>

            <label className="flex items-center gap-2 mt-6 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isWarranty}
                onChange={(evento) => setIsWarranty(evento.target.checked)}
                className="accent-status-success"
              />
              <span className="text-text-secondary">Saiu na garantia</span>
            </label>
          </div>

          <div>
            <label className={ROTULO}>Observações</label>
            <textarea
              rows={3}
              value={notes}
              onChange={(evento) => setNotes(evento.target.value)}
              className={`${CAMPO} resize-y`}
            />
          </div>

          <p className="text-[10px] text-text-tertiary leading-relaxed border-l-2 border-border-sutil pl-3">
            Abrir manutenção <span className="text-text-secondary">não muda o status do ativo</span>.
            Contrato de suporte e upgrade agendado não tiram o equipamento de ninguém. Para
            colocá-lo em Manutenção, troque o rótulo de status na tela do ativo — são dois fatos,
            e são dois cliques de propósito.
          </p>

          {erro && (
            <div className="border border-status-danger/40 bg-status-danger/10 text-status-danger px-3 py-2">
              {erro}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
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
              {salvando ? 'Salvando…' : editando ? 'Salvar' : 'Abrir manutenção'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
