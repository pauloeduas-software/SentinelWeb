import { useState } from 'react';
import { Check, ChevronDown, ChevronRight, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Sugestao } from '../../../domain/shared/reconciliation.types';
import { linhasDaEvidencia, ROTULOS, resumoDaSugestao } from '../helpers/sugestao.helper';

// UMA SUGESTÃO, COM A EVIDÊNCIA À VISTA.
//
// A evidência é aberta por padrão nas duas sugestões que mexem em POSSE
// (`SHARED_POST` e `CHECKOUT`) e fechada nas outras. Não é preferência de
// layout: são as duas em que aceitar sem ler muda o cadastro de mais de uma
// pessoa, e o custo de um clique a mais é menor que o de um cadastro
// degradado (D47).

interface Props {
  sugestao: Sugestao;
  /** Postos disponíveis, para o `SHARED_POST` escolher onde a máquina fica. */
  postos: { id: string; name: string }[];
  ocupado: boolean;
  onAceitar: (id: string, extra?: { locationId?: string }) => void;
  onRecusar: (id: string) => void;
}

export default function SugestaoCard({ sugestao, postos, ocupado, onAceitar, onRecusar }: Props) {
  const rotulo = ROTULOS[sugestao.kind];
  const mexeEmPosse = sugestao.kind === 'SHARED_POST' || sugestao.kind === 'CHECKOUT';
  const [aberta, setAberta] = useState(mexeEmPosse);

  // O posto só é perguntado quando o sistema não tem como saber: se o ativo já
  // está numa localização marcada como posto, ela vem escolhida.
  const precisaEscolherPosto = sugestao.kind === 'SHARED_POST' && !sugestao.targetLocation;
  const [posto, setPosto] = useState('');

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
          {precisaEscolherPosto && (
            <select
              value={posto}
              onChange={(evento) => setPosto(evento.target.value)}
              className="bg-bg-surface border border-border-sutil px-2 py-1.5 text-xs font-mono text-text-primary"
            >
              <option value="">Escolha o posto…</option>
              {postos.map((opcao) => (
                <option key={opcao.id} value={opcao.id}>{opcao.name}</option>
              ))}
            </select>
          )}

          <button
            type="button"
            disabled={ocupado || (precisaEscolherPosto && !posto)}
            onClick={() => onAceitar(sugestao.id, posto ? { locationId: posto } : undefined)}
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
