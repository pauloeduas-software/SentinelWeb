import { Archive, PackageX, Trash2, TriangleAlert, X } from 'lucide-react';
import type { AssetRelatorio, AssetView } from '../../../domain/shared/asset.types';

// AS VISTAS E OS FILTROS DA LISTAGEM DE ATIVOS.
//
// Não é o `ListToolbar` compartilhado, e a separação é a mesma decisão do
// servidor (D20): "Ativos / Lixeira" é genérico e vive lá; "Descomissionados",
// "Arquivados" e "posto vago" só existem no ITAM e vivem aqui. Somar essas abas
// ao componente compartilhado o obrigaria a conhecer colunas que só uma tabela
// do sistema tem.
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
  relatorio?: AssetRelatorio;
  onRelatorioChange: (relatorio?: AssetRelatorio) => void;
  /** O nome do status filtrado, quando um contador do cabeçalho foi clicado. */
  statusFiltrado: string | null;
  onLimparStatus: () => void;
}

export default function AssetFilterBar({
  view, onViewChange, descomissionados, arquivados, relatorio, onRelatorioChange,
  statusFiltrado, onLimparStatus,
}: AssetFilterBarProps) {
  const abas: { valor: AssetView; rotulo: string; icone?: typeof PackageX; contador?: number }[] = [
    { valor: 'active', rotulo: 'Ativos' },
    { valor: 'archived', rotulo: 'Arquivados', icone: Archive, contador: arquivados },
    { valor: 'retired', rotulo: 'Descomissionados', icone: PackageX, contador: descomissionados },
    { valor: 'trashed', rotulo: 'Lixeira', icone: Trash2 },
  ];

  const postoVago = relatorio === 'posto-vago';

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

      {/* RELATÓRIO, não filtro de coluna: "ativo entregue a um posto sem
          ocupante" é uma pergunta operacional — equipamento parado em mesa
          vazia —, e a resposta vem do servidor para a paginação não mentir. */}
      <button
        type="button"
        onClick={() => onRelatorioChange(postoVago ? undefined : 'posto-vago')}
        title="Ativos entregues a um posto que não tem nenhum ocupante aberto"
        className={`${CLASSE_ABA} border ${
          postoVago
            ? 'border-status-warning/50 bg-status-warning/10 text-status-warning'
            : 'border-border-sutil text-text-tertiary hover:text-text-primary hover:bg-bg-base'
        }`}
      >
        <TriangleAlert size={13} /> Posto vago
        {postoVago && <X size={12} />}
      </button>

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
