import { useState } from 'react';
import AbaAuditorias from './components/AbaAuditorias';
import AbaDepreciacao from './components/AbaDepreciacao';
import AbaManutencoes from './components/AbaManutencoes';
import AbaPrazos from './components/AbaPrazos';
import AbaResponsabilidade from './components/AbaResponsabilidade';
import AbaBuilder from './components/AbaBuilder';
import PainelDeAlertas from './components/PainelDeAlertas';
import {
  useAuditReportQuery, useBuilderFieldsQuery, useDeadlineReportQuery,
  useDepreciationReportQuery, useGerarRelatorio, useMaintenanceReportQuery,
  useResponsabilidadeQuery,
} from '../../domain/report/report.queries';

// OS RELATÓRIOS (docs/FASE-8-PLANO-ITAM.md, Etapa D).
//
// QUATRO ABAS NUMA PÁGINA, e a F10 HERDA ESTA MOLDURA: export CSV, seletor de
// colunas e report builder entram aqui, como abas desta mesma tela — não numa
// segunda página de relatórios, que é como duas listas do mesmo dado começam a
// divergir.
//
// NENHUM RELATÓRIO ESCREVE. As quatro consultas são `GET` e não há mutação em
// lugar nenhum desta pasta; um relatório que grava é um relatório que muda o que
// ele mesmo mede.
//
// Só a aba VISÍVEL consulta (o `enabled` nas queries): abrir a página disparando
// as quatro faria o de depreciação varrer a frota treze vezes — o valor de hoje
// mais os doze pontos da curva — para três abas que ninguém abriu.

type AbaDoRelatorio =
  | 'depreciacao' | 'prazos' | 'auditorias' | 'manutencoes' | 'alertas'
  | 'responsabilidade' | 'builder';

const ABAS: { id: AbaDoRelatorio; rotulo: string; descricao: string }[] = [
  {
    id: 'depreciacao',
    rotulo: 'Depreciação',
    descricao: 'Quanto o parque custou, quanto vale hoje, e quem não entra na conta — com o motivo.',
  },
  {
    id: 'prazos',
    rotulo: 'Garantias e EOL',
    descricao: 'O que vence na janela configurada. Garantia vira chamado; fim de vida vira orçamento.',
  },
  {
    id: 'auditorias',
    rotulo: 'Auditorias',
    descricao: 'Vencidas, a vencer e nunca conferidas — três baldes, porque a ação de cada um é diferente.',
  },
  {
    id: 'manutencoes',
    rotulo: 'Manutenções',
    descricao: 'Custo acumulado, o que está em aberto e para onde o dinheiro está indo.',
  },
  {
    // AS DUAS DA F10 (Etapa F), e as duas leem a MESMA view
    // `vw_asset_responsibles` — a Camada 3 do modelo de posse, que não é coluna
    // de tabela nenhuma.
    id: 'responsabilidade',
    rotulo: 'Responsabilidade',
    descricao: 'O que cada pessoa responde, separado em direto × por posto × por ativo — '
      + 'porque na saída dela só o primeiro vai embora com ela.',
  },
  {
    id: 'builder',
    rotulo: 'Montar relatório',
    descricao: 'Escolha as colunas e agrupe. É aqui que "quanto em equipamento cada posto '
      + 'acumula" se responde — agrupando por uma coluna que não existe em tabela nenhuma.',
  },
  {
    // A CENTRAL E A CONFIGURAÇÃO ficam aqui, e não em /configuracoes: quem muda a
    // antecedência de um aviso está olhando a lista que ele gera. É a mesma escolha
    // que pôs os botões da descoberta ao lado do painel de cobertura na F7.
    id: 'alertas',
    rotulo: 'Alertas',
    descricao: 'A central, os canais e os limiares — do lado dos números que eles explicam.',
  },
];

export default function RelatoriosPage() {
  const [aba, setAba] = useState<AbaDoRelatorio>('depreciacao');

  const depreciacao = useDepreciationReportQuery(aba === 'depreciacao');
  const prazos = useDeadlineReportQuery(aba === 'prazos');
  const auditorias = useAuditReportQuery(aba === 'auditorias');
  const manutencoes = useMaintenanceReportQuery(aba === 'manutencoes');
  const responsabilidade = useResponsabilidadeQuery(aba === 'responsabilidade');
  const camposDoBuilder = useBuilderFieldsQuery(aba === 'builder');
  const builder = useGerarRelatorio();

  const atual = ABAS.find((item) => item.id === aba)!;
  const carregando =
    (aba === 'depreciacao' && depreciacao.isPending)
    || (aba === 'prazos' && prazos.isPending)
    || (aba === 'auditorias' && auditorias.isPending)
    || (aba === 'manutencoes' && manutencoes.isPending)
    || (aba === 'responsabilidade' && responsabilidade.isPending);

  return (
    <div className="animate-in fade-in duration-300 flex flex-col pb-6 font-mono">

      <div className="mb-6">
        <h2 className="text-xl text-text-primary uppercase tracking-widest">Relatórios</h2>
        <p className="text-xs text-text-tertiary mt-2 max-w-3xl leading-relaxed">{atual.descricao}</p>
      </div>

      <div className="flex flex-wrap border border-border-sutil text-xs mb-5">
        {ABAS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setAba(item.id)}
            className={`px-4 py-2 uppercase tracking-widest transition-colors ${
              item.id === aba
                ? 'bg-text-primary text-bg-base'
                : 'text-text-tertiary hover:text-text-primary hover:bg-bg-base'
            }`}
          >
            {item.rotulo}
          </button>
        ))}
      </div>

      <div className="text-xs">
        {carregando && <p className="text-text-tertiary">Calculando…</p>}

        {aba === 'depreciacao' && depreciacao.data && <AbaDepreciacao dados={depreciacao.data} />}
        {aba === 'prazos' && prazos.data && <AbaPrazos dados={prazos.data} />}
        {aba === 'auditorias' && auditorias.data && <AbaAuditorias dados={auditorias.data} />}
        {aba === 'manutencoes' && manutencoes.data && <AbaManutencoes dados={manutencoes.data} />}
        {aba === 'responsabilidade' && <AbaResponsabilidade relatorio={responsabilidade.data} />}

        {aba === 'builder' && (
          <AbaBuilder
            campos={camposDoBuilder.data}
            resultado={builder.data}
            gerando={builder.isPending}
            erro={builder.error?.message ?? null}
            onGerar={(pedido) => builder.mutate(pedido)}
          />
        )}

        {aba === 'alertas' && <PainelDeAlertas />}
      </div>
    </div>
  );
}
