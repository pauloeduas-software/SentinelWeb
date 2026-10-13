import { useState } from 'react';
import { Check, ChevronDown, ChevronRight, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Sugestao } from '../../../domain/shared/reconciliation.types';
import { linhasDaEvidencia, ROTULOS, resumoDaSugestao } from '../helpers/sugestao.helper';

// UMA SUGESTÃO, COM A EVIDÊNCIA À VISTA.
//
// A evidência nasce fechada e abre num clique: sugestão sem evidência visível é
// palpite, e ninguém deveria aceitar um palpite que reescreve o inventário.

interface Props {
  sugestao: Sugestao;
  ocupado: boolean;
  onAceitar: (id: string) => void;
  onRecusar: (id: string) => void;
}

export default function SugestaoCard({ sugestao, ocupado, onAceitar, onRecusar }: Props) {
  const rotulo = ROTULOS[sugestao.kind];
  const [aberta, setAberta] = useState(false);

  const evidencia = linhasDaEvidencia(sugestao.evidence);

  return (
    <div className="border border-border-sutil bg-bg-base">
      <div className="p-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <span className={`font-mono text-xs uppercase tracking-widest ${rotulo.cor}`}>{rotulo.titulo}</span>
            <span className="text-[10px] font-mono text-text-tertiary border border-border-sutil px-1.5 py-0.5">
              {sugestao.score} pts{sugestao.signal ? ` · ${sugestao.signal}` : ''}
            </span>
          </div>

          <p className="text-sm text-text-primary mt-2 font-mono truncate">{resumoDaSugestao(sugestao)}</p>
          <p className="text-[10px] text-text-tertiary mt-1 leading-relaxed">{rotulo.acao}</p>

          {sugestao.asset && (
            <Link
              to={`/ativos/${sugestao.asset.id}`}
              className="text-[10px] text-status-info hover:underline mt-2 inline-block"
            >
              abrir {sugestao.asset.assetTag}
            </Link>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            disabled={ocupado}
            onClick={() => onAceitar(sugestao.id)}
            className="p-2 text-status-success hover:bg-status-success/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="Aceitar"
          >
            <Check size={16} />
          </button>
          <button
            type="button"
            disabled={ocupado}
            onClick={() => onRecusar(sugestao.id)}
            className="p-2 text-status-danger hover:bg-status-danger/10 disabled:opacity-30 transition-colors"
            title="Recusar"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setAberta((estava) => !estava)}
        className="w-full px-4 py-2 border-t border-border-sutil flex items-center gap-2 text-[10px] uppercase tracking-widest text-text-tertiary hover:text-text-primary transition-colors"
      >
        {aberta ? <ChevronDown size={12} /> : <ChevronRight size={12} />} Evidência
      </button>

      {aberta && (
        <dl className="px-4 pb-4 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-[11px] font-mono">
          {evidencia.map(({ chave, valor }) => (
            <div key={chave} className="flex gap-2 min-w-0">
              <dt className="text-text-tertiary shrink-0">{chave}:</dt>
              <dd className="text-text-secondary truncate" title={valor}>{valor}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
