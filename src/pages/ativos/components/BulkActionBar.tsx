import { useState } from 'react';
import { Trash2, X } from 'lucide-react';
import ReferenceSelect from '../../components/ReferenceSelect';
import type { BulkOperacao } from '../../../domain/shared/asset.types';

// A BARRA DE AÇÃO EM MASSA — aparece quando há seleção e some quando não há.
//
// UMA operação por vez, declarada (D21): trocar o status, mover de localização
// ou mandar para a lixeira. O lote é TUDO OU NADA — se um ativo barrar numa
// invariante, nenhum dos outros muda, e a mensagem diz qual barrou e por quê.
// Por isso o erro aparece AQUI, ao lado do botão que o causou, em vez de sumir
// num alerta: ele é o resultado da operação.
//
// Como todo componente desta pasta, não fala HTTP: recebe `onAplicar` por prop.
// O `ReferenceSelect` é a exceção já documentada — busca as opções pela query
// do domínio.

const CLASSE_CAMPO =
  'p-2 bg-bg-base border border-border-sutil text-text-primary focus:outline-none focus:border-text-secondary transition-colors';

interface BulkActionBarProps {
  quantos: number;
  /** Recebe a operação montada; o hook da página junta os ids. */
  onAplicar: (operacao: BulkOperacao) => Promise<void>;
  onLimpar: () => void;
}

export default function BulkActionBar({ quantos, onAplicar, onLimpar }: BulkActionBarProps) {
  const [statusId, setStatusId] = useState('');
  const [locationId, setLocationId] = useState('');
  const [aplicando, setAplicando] = useState(false);
  const [erro, setErro] = useState('');

  const aplicar = async (operacao: BulkOperacao) => {
    setAplicando(true);
    setErro('');
    try {
      await onAplicar(operacao);
      setStatusId('');
      setLocationId('');
    } catch (falha) {
      setErro((falha as Error).message);
    } finally {
      setAplicando(false);
    }
  };

  const excluir = async () => {
    if (!confirm(`Mover ${quantos} ${quantos === 1 ? 'ativo' : 'ativos'} para a lixeira?`)) return;
    await aplicar({ op: 'delete' });
  };

  return (
    <div className="border border-text-primary/30 bg-surface-card p-4 font-mono text-xs space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-text-primary uppercase tracking-widest">
          {quantos} {quantos === 1 ? 'selecionado' : 'selecionados'}
        </span>

        <div className="flex items-center gap-2">
          <ReferenceSelect rota="status-labels" valor={statusId} onChange={setStatusId} />
          <button
            type="button"
            disabled={!statusId || aplicando}
            onClick={() => void aplicar({ op: 'status', statusId })}
            className="px-3 py-2 border border-border-sutil text-text-secondary hover:text-text-primary hover:bg-bg-base transition-colors disabled:opacity-30 disabled:cursor-not-allowed whitespace-nowrap"
          >
            Trocar status
          </button>
        </div>

        <div className="flex items-center gap-2">
          <ReferenceSelect rota="locations" valor={locationId} onChange={setLocationId} />
          <button
            type="button"
            disabled={!locationId || aplicando}
            onClick={() => void aplicar({ op: 'location', locationId })}
            className="px-3 py-2 border border-border-sutil text-text-secondary hover:text-text-primary hover:bg-bg-base transition-colors disabled:opacity-30 disabled:cursor-not-allowed whitespace-nowrap"
          >
            Mover
          </button>
        </div>

        <button
          type="button"
          disabled={aplicando}
          onClick={() => void excluir()}
          className={`${CLASSE_CAMPO} flex items-center gap-2 text-text-tertiary hover:text-status-danger disabled:opacity-30`}
        >
          <Trash2 size={13} /> Lixeira
        </button>

        <button
          type="button"
          onClick={onLimpar}
          className="flex items-center gap-2 px-3 py-2 text-text-tertiary hover:text-text-primary transition-colors ml-auto"
        >
          <X size={13} /> Limpar seleção
        </button>
      </div>

      {erro && (
        <div className="p-3 bg-status-danger/10 text-status-danger border border-status-danger/20">{erro}</div>
      )}

      <p className="text-text-tertiary text-[10px] leading-relaxed">
        Tudo ou nada: se um ativo do lote barrar numa regra — entregue e indo para um status de
        estoque, por exemplo —, NENHUM é alterado, e a mensagem diz qual foi. Máximo de 200 por vez.
      </p>
    </div>
  );
}
