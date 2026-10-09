import { useState } from 'react';
import AbaPrazos from './components/AbaPrazos';
import AbaResponsabilidade from './components/AbaResponsabilidade';
import { useDeadlineReportQuery, useResponsabilidadeQuery } from '../../domain/report/report.queries';

// OS RELATÓRIOS (docs/historico/fase-08-ciclo-de-vida.md, Etapa D).
//
// DUAS ABAS, e eram sete. Saíram depreciação (D152), auditorias (D157),
// manutenções (D158), alertas (D151) e o montador de relatório (D154).
//
// NENHUM RELATÓRIO ESCREVE. As duas consultas são `GET` e não há mutação em lugar
// nenhum desta pasta; um relatório que grava é um relatório que muda o que ele
// mesmo mede.
//
// Só a aba VISÍVEL consulta (o `enabled` nas queries).

type AbaDoRelatorio = 'prazos' | 'responsabilidade';

const ABAS: { id: AbaDoRelatorio; rotulo: string; descricao: string }[] = [
  {
    id: 'prazos',
    rotulo: 'Garantias e EOL',
    descricao: 'O que vence na janela configurada. Garantia vira chamado; fim de vida vira orçamento.',
  },
  {
    // Lê a view `vw_asset_responsibles` — a Camada 3 do modelo de posse, que não
    // é coluna de tabela nenhuma (D66, D129).
    id: 'responsabilidade',
    rotulo: 'Responsabilidade',
    descricao: 'O que cada pessoa responde, separado em direto × por posto × por ativo — '
      + 'porque na saída dela só o primeiro vai embora com ela.',
  },
];

export default function RelatoriosPage() {
  const [aba, setAba] = useState<AbaDoRelatorio>('prazos');

  const prazos = useDeadlineReportQuery(aba === 'prazos');
  const responsabilidade = useResponsabilidadeQuery(aba === 'responsabilidade');

  const atual = ABAS.find((item) => item.id === aba)!;
  const carregando =
    (aba === 'prazos' && prazos.isPending)
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

        {aba === 'prazos' && prazos.data && <AbaPrazos dados={prazos.data} />}
        {aba === 'responsabilidade' && <AbaResponsabilidade relatorio={responsabilidade.data} />}
      </div>
    </div>
  );
}
