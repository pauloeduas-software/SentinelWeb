import { Archive, MonitorSmartphone, PackageX, Trash2, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { AssetView } from '../../../domain/shared/asset.types';

// AS VISTAS E OS FILTROS DA LISTAGEM DE ATIVOS.
//
// Não é o `ListToolbar` compartilhado, e a separação é a mesma decisão do
// servidor (D20): "Ativos / Lixeira" é genérico e vive lá; "Descomissionados",
// "Arquivados" só existem no ITAM e vivem aqui. Somar essas abas ao componente
// compartilhado o obrigaria a conhecer colunas que só uma tabela do sistema tem.
//
// A LINHA SOBRE OS POSTOS aparece só na vista padrão, e ela existe porque a
// ausência é a parte confusa: quem acabou de entregar um computador a uma mesa
// volta para esta tela e não o encontra. Dizer para onde ele foi, com o link,
// custa uma linha e evita a conclusão de que o sistema perdeu o ativo.
//
// ARQUIVADO E DESCOMISSIONADO SÃO ABAS SEPARADAS de propósito (D19). Parecem a
// mesma coisa — "sumiu da lista" — e respondem a perguntas diferentes: o
// descomissionado saiu do PATRIMÔNIO e não volta (foi vendido, descartado,
// roubado); o arquivado saiu da OPERAÇÃO e volta trocando o status. Uma aba só
// para os dois obrigaria quem procura o notebook que voltará do depósito a
// varrer a lista dos que foram vendidos.

const CLASSE_ABA = 'flex items-center gap-2 px-4 py-2 uppercase tracking-widest transition-colors';

interface AssetFilterBarProps {
  view: AssetView;
  onViewChange: (view: AssetView) => void;
  /** Quantos ativos saíram do patrimônio — o contador da aba. */
  descomissionados: number;
  /** Quantos saíram de operação (status de tipo `ARCHIVED`) — o contador da outra. */
  arquivados: number;
  /** O nome do status filtrado, quando um contador do cabeçalho foi clicado. */
  statusFiltrado: string | null;
  onLimparStatus: () => void;
}

export default function AssetFilterBar({
  view, onViewChange, descomissionados, arquivados,
  statusFiltrado, onLimparStatus,
}: AssetFilterBarProps) {
  const abas: { valor: AssetView; rotulo: string; icone?: typeof PackageX; contador?: number }[] = [
    { valor: 'active', rotulo: 'Ativos' },
    { valor: 'archived', rotulo: 'Arquivados', icone: Archive, contador: arquivados },
    { valor: 'retired', rotulo: 'Descomissionados', icone: PackageX, contador: descomissionados },
    { valor: 'trashed', rotulo: 'Lixeira', icone: Trash2 },
  ];

  return (
    <div className="flex flex-wrap items-center gap-3 mb-4 font-mono text-xs">
      <div className="flex border border-border-sutil">
        {abas.map((aba) => (
          <button
            key={aba.valor}
            type="button"
            onClick={() => onViewChange(aba.valor)}
            className={`${CLASSE_ABA} ${
              view === aba.valor
                ? 'bg-text-primary text-bg-base'
                : 'text-text-tertiary hover:text-text-primary hover:bg-bg-base'
            }`}
          >
            {aba.icone && <aba.icone size={13} />}
            {aba.rotulo}
            {aba.contador !== undefined && aba.contador > 0 && (
              <span className="tabular-nums">{aba.contador}</span>
            )}
          </button>
        ))}
      </div>

      {view === 'active' && (
        <span className="flex items-center gap-1.5 text-text-tertiary normal-case tracking-normal">
          <MonitorSmartphone size={12} className="shrink-0" />
          Computador entregue a um posto aparece em
          <Link to="/postos" className="text-text-secondary hover:text-text-primary underline underline-offset-2">
            Postos
          </Link>
        </span>
      )}

      {statusFiltrado && (
        <button
          type="button"
          onClick={onLimparStatus}
          className={`${CLASSE_ABA} border border-status-info/40 bg-status-info/10 text-status-info`}
        >
          Status: {statusFiltrado} <X size={12} />
        </button>
      )}
    </div>
  );
}
