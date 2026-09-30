import { useState } from 'react';
import AbaAuditorias from './components/AbaAuditorias';
import AbaDepreciacao from './components/AbaDepreciacao';
import AbaManutencoes from './components/AbaManutencoes';
import AbaPrazos from './components/AbaPrazos';
import PainelDeAlertas from './components/PainelDeAlertas';
import {
  useAuditReportQuery, useDeadlineReportQuery, useDepreciationReportQuery,
  useMaintenanceReportQuery,
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

type AbaDoRelatorio = 'depreciacao' | 'prazos' | 'auditorias' | 'manutencoes' | 'alertas';

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

  const atual = ABAS.find((item) => item.id === aba)!;
  const carregando =
    (aba === 'depreciacao' && depreciacao.isPending)
    || (aba === 'prazos' && prazos.isPending)
    || (aba === 'auditorias' && auditorias.isPending)
    || (aba === 'manutencoes' && manutencoes.isPending);

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
        {aba === 'alertas' && <PainelDeAlertas />}
      </div>
    </div>
  );
}
