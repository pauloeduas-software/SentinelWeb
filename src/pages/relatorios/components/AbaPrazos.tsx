import { Link } from 'react-router-dom';
import Indicador from './Indicador';
import type { ItemDePrazo, RelatorioDePrazos } from '../../../domain/shared/lifecycle.types';
import { formatarData } from '../../helpers/format.helper';

// GARANTIAS E FIM DE VIDA — duas listas e dois limiares.
//
// Não é uma lista de "prazos": garantia vencendo é urgência de CHAMADO — depois
// dela o conserto passa a ser pago — e EOL é urgência de ORÇAMENTO, que se planeja
// com meses de antecedência. Juntá-las daria uma lista ordenada por data em que as
// duas conversas se atropelam.
//
// O JÁ VENCIDO ENTRA, marcado: a pergunta "o que vence nos próximos 30 dias" com o
// vencido de fora esconderia justamente o caso em que ninguém agiu.
//
// ═════════════════════════════════════════════════════════════════════════════
// A JANELA É SIMÉTRICA, E OS NÚMEROS VÊM DE `count` — as duas coisas juntas.
//
// A consulta não tinha piso no passado, ordenava crescente e tinha teto: as vagas
// eram tomadas pelas garantias mais ANTIGAS, e o que vence nos próximos trinta dias
// — o motivo da tela — não aparecia. Uma aba "a vencer" em que nada vence.
//
// Agora a janela é de N dias para cada lado (a MESMA do sino), e o passado profundo
// não foi escondido: ele virou o número de "vencidas antes da janela", contado no
// servidor. E os indicadores saem dos contadores, nunca de `.length` de uma lista
// que tem teto.
// ═════════════════════════════════════════════════════════════════════════════

export default function AbaPrazos({ dados }: { dados: RelatorioDePrazos }) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Indicador
          rotulo="Garantias no radar"
          valor={String(dados.garantiasTotal)}
          nota={`± ${dados.warrantyAlertDays} dias de hoje`}
        />
        <Indicador
          rotulo="Garantias já vencidas"
          valor={String(dados.garantiasVencidas)}
          cor={dados.garantiasVencidas > 0 ? 'var(--color-status-danger)' : undefined}
          nota={dados.garantiasAntigas > 0 ? `+ ${dados.garantiasAntigas} antes da janela` : undefined}
        />
        <Indicador
          rotulo="Fim de vida no radar"
          valor={String(dados.eolTotal)}
          nota={`± ${dados.eolAlertDays} dias de hoje`}
        />
        <Indicador
          rotulo="Fim de vida já passado"
          valor={String(dados.eolVencidos)}
          cor={dados.eolVencidos > 0 ? 'var(--color-status-warning)' : undefined}
          nota={dados.eolAntigos > 0 ? `+ ${dados.eolAntigos} antes da janela` : undefined}
        />
      </div>

      {dados.truncado && (
        <p className="text-[10px] text-status-warning border border-status-warning/30 bg-status-warning/5 px-3 py-2">
          As tabelas abaixo mostram as primeiras 500 de cada lista. Os números acima
          são da frota inteira.
        </p>
      )}

      <Lista
        titulo="Garantia"
        explicacao="Depois do vencimento, o conserto passa a ser pago. É a lista que vira chamado."
        itens={dados.garantias}
        vazio="Nenhuma garantia vence nem venceu dentro da janela configurada."
      />

      <Lista
        titulo="Fim de vida"
        explicacao="Planejamento de troca. É a lista que vira orçamento — e por isso a janela dela é mais larga."
        itens={dados.eol}
        vazio="Nenhum ativo chega ao fim de vida dentro da janela configurada."
      />
    </div>
  );
}

const CABECALHO = 'px-3 py-2 text-left text-[10px] uppercase tracking-widest text-text-tertiary font-normal';

/** O prazo em palavras, com o SINAL na frente do número. */
function textoDoPrazo(dias: number): { texto: string; cor: string } {
  if (dias < 0) {
    return {
      texto: `venceu há ${Math.abs(dias)} ${Math.abs(dias) === 1 ? 'dia' : 'dias'}`,
      cor: 'var(--color-status-danger)',
    };
  }
  if (dias === 0) return { texto: 'vence hoje', cor: 'var(--color-status-danger)' };
  if (dias <= 7) return { texto: `em ${dias} dias`, cor: 'var(--color-status-warning)' };
  return { texto: `em ${dias} dias`, cor: 'var(--color-text-secondary)' };
}

interface ListaProps {
  titulo: string;
  explicacao: string;
  itens: ItemDePrazo[];
  vazio: string;
}

function Lista({ titulo, explicacao, itens, vazio }: ListaProps) {
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
                <th className={CABECALHO}>Vence</th>
                <th className={CABECALHO}>Prazo</th>
              </tr>
            </thead>
            <tbody>
              {itens.map((item) => {
                const prazo = textoDoPrazo(item.dias);
                return (
                  <tr key={item.assetId} className="border-b border-border-sutil/40 last:border-0 hover:bg-bg-base/40 transition-colors">
                    <td className="px-3 py-2">
                      <Link to={`/ativos/${item.assetId}`} className="text-text-primary hover:text-status-success transition-colors">
                        {item.assetTag}
                      </Link>
                      {item.name && <span className="text-text-tertiary"> · {item.name}</span>}
                    </td>
                    <td className="px-3 py-2 text-text-tertiary">{item.modelName}</td>
                    <td className="px-3 py-2 text-text-tertiary">{item.locationName ?? '—'}</td>
                    <td className="px-3 py-2 text-text-tertiary">{formatarData(item.vence)}</td>
                    <td className="px-3 py-2" style={{ color: prazo.cor }}>{prazo.texto}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
