import { Link } from 'react-router-dom';
import Indicador from './Indicador';
import type { ItemDeAuditoria, RelatorioDeAuditorias } from '../../../domain/shared/lifecycle.types';
import { formatarData } from '../../helpers/format.helper';

// AUDITORIAS: VENCIDAS · A VENCER · NUNCA.
//
// ═════════════════════════════════════════════════════════════════════════════
// "NUNCA" É UM BALDE PRÓPRIO PORQUE A AÇÃO É DIFERENTE.
//
// No banco, `lastAuditAt IS NULL` e `lastAuditAt < corte` cabem num `OR` — e é
// assim que o alerta pergunta. Aqui elas ficam separadas porque um ativo VENCIDO
// tem histórico de conferência e uma última localização conhecida, enquanto um
// ativo NUNCA conferido pode não existir fisicamente: foi cadastrado e ninguém
// nunca olhou. A primeira lista é uma rota de conferência; a segunda é uma
// pergunta sobre o cadastro.
// ═════════════════════════════════════════════════════════════════════════════
//
// O CORTE é calculado a cada leitura a partir do intervalo configurado (D53): mudar
// de 12 para 6 meses vale na próxima abertura desta tela, sem `UPDATE` nenhum.
//
// ═════════════════════════════════════════════════════════════════════════════
// OS INDICADORES SAEM DOS CONTADORES, NUNCA DE `.length` DAS LISTAS.
//
// As três listas têm teto no servidor. Os indicadores liam `dados.vencidas.length`
// ao lado de `emDia`/`total`, que são `count` de verdade — então num parque com
// mais de quinhentas vencidas o número travava em "500", os quatro paravam de
// fechar com o total, e nada na tela dizia que havia corte.
//
// Número truncado em silêncio é o pior caso num relatório: está formatado, é
// plausível, e ninguém confere. A lista é AMOSTRA acionável; o contador é a
// verdade, e quando os dois divergem a tela diz isso em uma linha.
// ═════════════════════════════════════════════════════════════════════════════

export default function AbaAuditorias({ dados }: { dados: RelatorioDeAuditorias }) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Indicador
          rotulo="Vencidas"
          valor={String(dados.vencidasTotal)}
          cor={dados.vencidasTotal > 0 ? 'var(--color-status-danger)' : undefined}
          nota={`corte em ${formatarData(dados.corte)}`}
        />
        <Indicador
          rotulo="A vencer"
          valor={String(dados.aVencerTotal)}
          cor={dados.aVencerTotal > 0 ? 'var(--color-status-warning)' : undefined}
          nota={`aviso com ${dados.auditWarningDays} dias`}
        />
        <Indicador
          rotulo="Nunca conferidos"
          valor={String(dados.nuncaTotal)}
          cor={dados.nuncaTotal > 0 ? 'var(--color-status-danger)' : undefined}
        />
        <Indicador
          rotulo="Em dia"
          valor={`${dados.emDia} / ${dados.total}`}
          cor="var(--color-chart-serie)"
          nota={`ciclo de ${dados.auditIntervalMonths} meses`}
        />
      </div>

      {dados.truncado && (
        <p className="text-[10px] text-status-warning border border-status-warning/30 bg-status-warning/5 px-3 py-2">
          As tabelas abaixo mostram as primeiras 500 de cada balde. Os números acima
          são da frota inteira — conferir por posto vai reduzindo a lista.
        </p>
      )}

      <p className="text-[10px] text-text-tertiary leading-relaxed max-w-3xl border-l-2 border-border-sutil pl-3">
        A conferência acontece por posto, em <Link to="/auditorias" className="text-status-success hover:underline">Auditorias</Link>.
        Máquina com agente e número de série batendo é conferida sozinha, uma vez por dia — hostname
        e MAC não contam: nenhum dos dois prova que alguém olhou o equipamento.
      </p>

      <Lista
        titulo="Vencidas"
        explicacao="Passaram do ciclo configurado. Cada uma tem histórico e um último local conhecido."
        itens={dados.vencidas}
        vazio="Nenhuma conferência vencida."
      />

      <Lista
        titulo="Nunca conferidos"
        explicacao="Cadastrados e nunca olhados. Os mais antigos primeiro — é onde a dúvida sobre o cadastro é maior."
        itens={dados.nunca}
        vazio="Todo ativo do parque já foi conferido pelo menos uma vez."
      />

      <Lista
        titulo="A vencer"
        explicacao="Dentro da antecedência do aviso. Dá para encaixar na próxima ronda."
        itens={dados.aVencer}
        vazio="Nenhuma conferência vence na antecedência configurada."
      />
    </div>
  );
}

const CABECALHO = 'px-3 py-2 text-left text-[10px] uppercase tracking-widest text-text-tertiary font-normal';

function Lista({ titulo, explicacao, itens, vazio }: {
  titulo: string; explicacao: string; itens: ItemDeAuditoria[]; vazio: string;
}) {
  return (
    <section className="space-y-2">
      <header className="space-y-1">
        <h3 className="text-[10px] uppercase tracking-widest text-text-secondary">{titulo}</h3>
        <p className="text-[10px] text-text-tertiary leading-relaxed max-w-2xl">{explicacao}</p>
      </header>

      {itens.length === 0 ? (
        <p className="text-text-tertiary text-[11px] border border-border-sutil bg-surface-card px-3 py-3">{vazio}</p>
      ) : (
        <div className="border border-border-sutil bg-surface-card overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-border-sutil bg-bg-base/40">
              <tr>
                <th className={CABECALHO}>Ativo</th>
                <th className={CABECALHO}>Modelo</th>
                <th className={CABECALHO}>Local</th>
                <th className={CABECALHO}>Última conferência</th>
              </tr>
            </thead>
            <tbody>
              {itens.map((item) => (
                <tr key={item.assetId} className="border-b border-border-sutil/40 last:border-0 hover:bg-bg-base/40 transition-colors">
                  <td className="px-3 py-2">
                    <Link to={`/ativos/${item.assetId}`} className="text-text-primary hover:text-status-success transition-colors">
                      {item.assetTag}
                    </Link>
                    {item.name && <span className="text-text-tertiary"> · {item.name}</span>}
                  </td>
                  <td className="px-3 py-2 text-text-tertiary">{item.modelName}</td>
                  <td className="px-3 py-2 text-text-tertiary">{item.locationName ?? '—'}</td>
                  <td className="px-3 py-2 text-text-tertiary">
                    {item.lastAuditAt
                      ? <>{formatarData(item.lastAuditAt)} · há {item.diasDesde} dia(s)</>
                      : <span className="text-status-danger">nunca</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
