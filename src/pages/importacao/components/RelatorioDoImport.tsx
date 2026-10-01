import { AlertTriangle, CheckCircle2, MinusCircle, Play, RotateCcw } from 'lucide-react';
import ListToolbar from '../../components/ListToolbar';
import type { Importacao, LinhaDoImport, SituacaoDaLinha } from '../../../domain/shared/import.types';

// O RELATÓRIO POR LINHA (F10, Etapa D) — a tela que o D68 existe para produzir.
//
// ANTES DE APLICAR, ela responde "o que vai acontecer com cada linha". DEPOIS,
// ela é a única trilha do que entrou — junto com o `ActivityLog` de cada
// gravação, é por ela que se desfaz à mão. É por isso que as linhas moram em
// tabela, e não numa resposta HTTP: 5.000 erros não sobrevivem ao fechamento da
// aba.

const SITUACOES: { id: SituacaoDaLinha | 'TODAS'; rotulo: string }[] = [
  { id: 'TODAS', rotulo: 'Todas' },
  { id: 'OK', rotulo: 'A gravar' },
  { id: 'ERRO', rotulo: 'Com erro' },
  { id: 'IGNORADA', rotulo: 'Sem mudança' },
];

const ICONE: Record<SituacaoDaLinha, { icone: typeof CheckCircle2; cor: string }> = {
  OK: { icone: CheckCircle2, cor: 'text-status-success' },
  ERRO: { icone: AlertTriangle, cor: 'text-status-danger' },
  IGNORADA: { icone: MinusCircle, cor: 'text-text-tertiary' },
};

interface Props {
  importacao: Importacao;
  linhas: readonly LinhaDoImport[];
  total: number;
  filtro: SituacaoDaLinha | 'TODAS';
  pagina: number;
  linhasPorPagina: number;
  aplicando: boolean;
  erro: string | null;
  onFiltro: (filtro: SituacaoDaLinha | 'TODAS') => void;
  onPagina: (pagina: number) => void;
  onAplicar: () => void;
  onRecomecar: () => void;
}

function Indicador({ numero, rotulo, cor }: { numero: number; rotulo: string; cor: string }) {
  return (
    <div className="border border-border-sutil px-4 py-3">
      <div className={`text-xl tabular-nums ${cor}`}>{numero}</div>
      <div className="text-[10px] uppercase tracking-widest text-text-tertiary mt-1">{rotulo}</div>
    </div>
  );
}

export default function RelatorioDoImport({
  importacao, linhas, total, filtro, pagina, linhasPorPagina,
  aplicando, erro, onFiltro, onPagina, onAplicar, onRecomecar,
}: Props) {
  const aplicado = importacao.status === 'APLICADO';

  return (
    <div className="space-y-4 font-mono">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Indicador numero={importacao.totalLinhas} rotulo="linhas no arquivo" cor="text-text-primary" />
        <Indicador
          numero={importacao.ok}
          rotulo={aplicado ? 'gravadas' : 'a gravar'}
          cor="text-status-success"
        />
        <Indicador numero={importacao.erro} rotulo="com erro" cor="text-status-danger" />
        <Indicador numero={importacao.ignorada} rotulo="sem mudança" cor="text-text-secondary" />
      </div>

      {/* O EFEITO DE SEGUNDA ORDEM DA OCUPAÇÃO (Etapa E): quantos ativos trocam
          de responsável sem nenhuma posse ser tocada. É o número que denuncia
          uma mesa de nome errado ANTES de o andar inteiro mudar de dono. */}
      {importacao.ganhamResponsavel !== null && (
        <div className="border border-status-warning/40 bg-status-warning/5 px-4 py-3 space-y-1">
          <p className="text-xs text-status-warning uppercase tracking-widest">
            Efeito sobre a responsabilidade
          </p>
          <p className="text-xs text-text-secondary leading-relaxed">
            <strong className="text-text-primary tabular-nums">{importacao.ganhamResponsavel}</strong>{' '}
            ativo(s) passam a ter responsável e{' '}
            <strong className="text-text-primary tabular-nums">{importacao.perdemResponsavel}</strong>{' '}
            deixam de ter — sem nenhuma entrega ser tocada. Importar ocupação muda quem responde por
            todo equipamento já entregue àquele posto.
          </p>
        </div>
      )}

      {erro && (
        <p className="border border-status-danger/40 bg-status-danger/10 px-3 py-2 text-xs text-status-danger">
          {erro}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {!aplicado ? (
          <button
            type="button"
            disabled={aplicando || importacao.ok === 0}
            onClick={onAplicar}
            className="flex items-center gap-2 px-4 py-2 bg-text-primary text-bg-base hover:bg-text-secondary text-[10px] uppercase tracking-widest transition-colors disabled:opacity-40"
          >
            <Play size={12} />
            {aplicando ? 'Aplicando…' : `Aplicar ${importacao.ok} linha(s)`}
          </button>
        ) : (
          <span className="flex items-center gap-2 px-3 py-2 border border-status-success/40 text-status-success text-[10px] uppercase tracking-widest">
            <CheckCircle2 size={12} /> Aplicado
          </span>
        )}

        <button
          type="button"
          onClick={onRecomecar}
          className="flex items-center gap-2 px-3 py-2 border border-border-sutil text-text-tertiary hover:text-text-primary text-[10px] uppercase tracking-widest transition-colors"
        >
          <RotateCcw size={12} /> Outro arquivo
        </button>

        {!aplicado && importacao.erro > 0 && (
          <span className="text-[10px] text-text-tertiary leading-relaxed">
            As linhas com erro NÃO são aplicadas — e continuam com erro depois. Corrija a planilha e
            suba de novo só as que faltaram.
          </span>
        )}
      </div>

      <div className="flex flex-wrap border border-border-sutil text-xs">
        {SITUACOES.map((situacao) => (
          <button
            key={situacao.id}
            type="button"
            onClick={() => onFiltro(situacao.id)}
            className={`px-4 py-2 uppercase tracking-widest transition-colors ${
              filtro === situacao.id
                ? 'bg-text-primary text-bg-base'
                : 'text-text-tertiary hover:text-text-primary hover:bg-bg-base'
            }`}
          >
            {situacao.rotulo}
          </button>
        ))}
      </div>

      <ListToolbar
        page={pagina}
        perPage={linhasPorPagina}
        total={total}
        onPageChange={onPagina}
      />

      <div className="border border-border-sutil divide-y divide-border-sutil/60">
        {linhas.map((linha) => {
          const { icone: Icone, cor } = ICONE[linha.status];

          return (
            <div key={linha.id} className="flex gap-3 px-3 py-2 text-xs">
              {/* O NÚMERO DA LINHA conta o cabeçalho como 1 — é o que aparece no
                  Excel, para a pessoa achar a linha errada sem somar nada. */}
              <span className="text-text-tertiary tabular-nums w-10 shrink-0">{linha.lineNumber}</span>
              <Icone size={13} className={`${cor} shrink-0 mt-0.5`} />

              <div className="min-w-0 flex-1">
                <p className={linha.status === 'ERRO' ? 'text-status-danger' : 'text-text-secondary'}>
                  {linha.message ?? '—'}
                </p>
                <p className="text-[10px] text-text-tertiary mt-1 truncate" title={JSON.stringify(linha.raw)}>
                  {Object.entries(linha.raw)
                    .filter(([, valor]) => valor !== '')
                    .map(([titulo, valor]) => `${titulo}: ${valor}`)
                    .join(' · ')}
                </p>
              </div>
            </div>
          );
        })}

        {linhas.length === 0 && (
          <p className="px-3 py-8 text-center text-xs text-text-tertiary">
            Nenhuma linha nesta situação.
          </p>
        )}
      </div>
    </div>
  );
}
