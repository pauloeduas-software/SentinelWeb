import { useState } from 'react';
import { Check, ChevronDown, ChevronRight, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Card } from '../../../components/ui/card';
import type { Sugestao } from '../../../types/reconciliation.types';
import { linhasDaEvidencia, ROTULOS, ROTULO_DO_SINAL, resumoDaSugestao } from '../helpers/sugestao.helper';

// UMA SUGESTÃO, COM A EVIDÊNCIA À VISTA.
//
// A evidência nasce fechada e abre num clique: sugestão sem evidência visível é
// palpite, e ninguém deveria aceitar um palpite que reescreve o inventário.

interface Props {
  sugestao: Sugestao;
  /** O `state` do link: a seta da ficha volta para esta lista. */
  volta: object;
  ocupado: boolean;
  onAceitar: (id: string) => void;
  onRecusar: (id: string) => void;
}

export default function SugestaoCard({ sugestao, volta, ocupado, onAceitar, onRecusar }: Props) {
  const rotulo = ROTULOS[sugestao.kind];
  const [aberta, setAberta] = useState(false);

  const evidencia = linhasDaEvidencia(sugestao.evidence);

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-text-primary">{rotulo.titulo}</span>
            <Badge>{sugestao.score} pts{sugestao.signal ? ` · ${ROTULO_DO_SINAL[sugestao.signal]}` : ''}</Badge>
          </div>

          <p className="truncate text-sm text-text-primary">{resumoDaSugestao(sugestao)}</p>
          <p className="text-xs leading-relaxed text-text-tertiary">{rotulo.acao}</p>

          {sugestao.asset && (
            <Link to={`/computadores/${sugestao.asset.id}`} state={volta} className="inline-block text-sm text-primary hover:underline">
              abrir <span className="font-mono">{sugestao.asset.assetTag}</span>
            </Link>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Button size="sm" disabled={ocupado} onClick={() => onAceitar(sugestao.id)}>
            <Check /> Aceitar
          </Button>
          <Button size="sm" variant="outline" disabled={ocupado} onClick={() => onRecusar(sugestao.id)}>
            <X /> Recusar
          </Button>
        </div>
      </div>

      <button
        type="button"
        aria-expanded={aberta}
        onClick={() => setAberta((estava) => !estava)}
        className="flex w-full items-center gap-2 border-t border-border-sutil px-4 py-2 text-sm text-text-tertiary transition-colors hover:text-text-primary"
      >
        {aberta ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />} Evidência
      </button>

      {aberta && (
        <dl className="grid grid-cols-1 gap-x-6 gap-y-1 px-4 pb-4 text-sm sm:grid-cols-2">
          {evidencia.map(({ chave, valor }) => (
            <div key={chave} className="flex min-w-0 gap-2">
              <dt className="shrink-0 text-text-tertiary">{chave}:</dt>
              <dd className="truncate text-text-secondary" title={valor}>{valor}</dd>
            </div>
          ))}
        </dl>
      )}
    </Card>
  );
}
