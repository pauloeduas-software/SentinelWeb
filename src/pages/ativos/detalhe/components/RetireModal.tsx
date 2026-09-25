import { useState } from 'react';
import { PackageX, X } from 'lucide-react';
import type { Asset, RetireInput } from '../../../../domain/shared/asset.types';
import { MOTIVOS_DA_SAIDA } from '../../helpers/descomissionamento.helper';

// DESCOMISSIONAR — registrar que o ativo saiu do PATRIMÔNIO.
//
// Modal próprio, e não um campo do formulário de ativo, pelo mesmo motivo da
// entrega: é uma OPERAÇÃO, com data, motivo e recusa própria (ativo entregue
// não sai do patrimônio). Como campo, viraria um `<select>` que alguém muda sem
// perceber ao editar o número de série.
//
// As três saídas são diferentes (D19) e o texto abaixo diz isso na hora da
// decisão, que é quando a dúvida existe: arquivar tira da operação, a lixeira é
// para cadastro errado, e isto aqui é o fato contábil de que o bem saiu.

const CLASSE_CAMPO =
  'w-full p-2 bg-bg-base border border-border-sutil text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-text-secondary transition-colors';

const ROTULO = 'text-text-secondary uppercase tracking-widest text-[10px]';

interface RetireModalProps {
  asset: Asset;
  onClose: () => void;
  onConfirmar: (data: RetireInput) => Promise<void>;
}

export default function RetireModal({ asset, onClose, onConfirmar }: RetireModalProps) {
  const [motivo, setMotivo] = useState(MOTIVOS_DA_SAIDA[0].value);
  const [data, setData] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  const enviar = async (event: React.FormEvent) => {
    event.preventDefault();
    setSalvando(true);
    setErro('');

    try {
      // Campo vazio vira AUSENTE, nunca `''`: uma data vazia chegaria ao
      // servidor como string inválida em vez de "não informado" — e ausente é
      // o que faz o servidor usar agora.
      await onConfirmar({
        retiredReason: motivo,
        ...(data ? { retiredAt: data } : {}),
        ...(observacoes.trim() ? { notes: observacoes.trim() } : {}),
      });
    } catch (falha) {
      // É aqui que aparece o 409 de ativo entregue, já traduzido pelo apiClient.
      setErro((falha as Error).message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-bg-base/80 backdrop-blur-sm">
      <div className="relative w-full max-w-lg bg-surface-card border border-border-sutil shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-sutil bg-bg-base/50">
          <h2 className="flex items-center gap-3 text-sm font-mono text-text-primary tracking-widest uppercase">
            <PackageX size={16} /> Descomissionar {asset.assetTag}
          </h2>
          <button onClick={onClose} className="p-2 text-text-tertiary hover:text-text-primary transition-colors">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={enviar} className="p-6 font-mono text-xs space-y-5">
          {erro && (
            <div className="p-3 bg-status-danger/10 text-status-danger border border-status-danger/20">{erro}</div>
          )}

          <p className="text-text-tertiary text-[10px] leading-relaxed">
            O ativo sai do PATRIMÔNIO e das listagens do dia a dia, mas continua existindo: entra no
            filtro "Descomissionados", segue no histórico e continua contando no relatório de
            depreciação, com a data em que saiu. Para tirar de operação sem dar baixa, mude o status
            para um de tipo arquivado; para desfazer um cadastro errado, use a lixeira.
          </p>

          <div className="space-y-1">
            <label className={ROTULO}>Motivo*</label>
            <select
              value={motivo}
              onChange={(event) => setMotivo(event.target.value as typeof motivo)}
              className={CLASSE_CAMPO}
            >
              {MOTIVOS_DA_SAIDA.map((opcao) => (
                <option key={opcao.value} value={opcao.value}>{opcao.label}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className={ROTULO}>Data da saída</label>
            <input
              type="date"
              value={data}
              onChange={(event) => setData(event.target.value)}
              className={CLASSE_CAMPO}
            />
            <p className="text-text-tertiary text-[10px] leading-relaxed pt-1">
              Em branco, vale agora. A venda pode ter sido semana passada e o registro, hoje.
            </p>
          </div>

          <div className="space-y-1">
            <label className={ROTULO}>Observações</label>
            <textarea
              value={observacoes}
              onChange={(event) => setObservacoes(event.target.value)}
              placeholder="Ex: vendido no lote 2026/03, nota 1187."
              className={`${CLASSE_CAMPO} h-20 resize-none`}
            />
            <p className="text-text-tertiary text-[10px] leading-relaxed pt-1">
              Fica na aba Histórico, presa a este evento — não é um campo do ativo.
            </p>
          </div>

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
              disabled={salvando}
              className="px-4 py-2 bg-text-primary text-bg-base hover:bg-text-secondary transition-colors disabled:opacity-50"
            >
              {salvando ? 'Registrando...' : 'Confirmar saída'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
