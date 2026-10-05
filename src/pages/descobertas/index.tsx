import { AlertCircle, Inbox } from 'lucide-react';
import ConfiguracaoDaDescoberta from './components/ConfiguracaoDaDescoberta';
import OciososTable from './components/OciososTable';
import OrfaosTable from './components/OrfaosTable';
import PainelDeCobertura from './components/PainelDeCobertura';
import SugestaoCard from './components/SugestaoCard';
import { useDescobertas, type AbaDaTela } from './hooks/useDescobertas';
import type { SuggestionKind } from '../../domain/shared/reconciliation.types';

// O QUE O AGENTE DESCOBRIU E O CADASTRO AINDA NÃO SABE
// (docs/historico/fase-07-convergencia-rmm-itam.md).
//
// A tela se chama DESCOBERTAS, e não "Reconciliação": ela leva o nome do que
// LISTA, não o do processo que roda por trás. É a mesma correção que aposentou
// `/itam` em favor de `/ativos` — "ITAM" era o nome do assunto do sistema
// inteiro, não daquela tela.
//
// Markup e mais nada: estado e chamadas ficam no `useDescobertas`.

const ABAS: { id: AbaDaTela; rotulo: string }[] = [
  { id: 'fila', rotulo: 'Sugestões' },
  { id: 'orfaos', rotulo: 'Sem cadastro' },
  { id: 'ociosos', rotulo: 'Ociosos' },
];

const FILTROS: { valor: SuggestionKind | undefined; rotulo: string }[] = [
  { valor: undefined, rotulo: 'Todas' },
  { valor: 'LINK', rotulo: 'Vínculo' },
  { valor: 'CHECKOUT', rotulo: 'Posse' },
  { valor: 'OCCUPANCY', rotulo: 'Ocupação' },
  { valor: 'SHARED_POST', rotulo: 'Posto compartilhado' },
  { valor: 'MERGE', rotulo: 'Fusão' },
];

export default function DescobertasPage() {
  const {
    aba, setAba, filtro, setFiltro, erro, limparErro,
    sugestoes, carregandoSugestoes, cobertura, carregandoCobertura,
    ociosos, orfaos, postos, ocupado,
    configuracao, salvandoConfiguracao,
    handleAceitar, handleRecusar, handleTriar, handleSalvarConfiguracao,
  } = useDescobertas();

  return (
    <div className="animate-in fade-in duration-300 flex flex-col pb-6">

      <div className="mb-6 shrink-0">
        <h2 className="text-xl font-mono text-text-primary uppercase tracking-widest">Descobertas</h2>
        <p className="text-xs text-text-tertiary mt-2 font-mono max-w-3xl leading-relaxed">
          O que o agente vê e o cadastro ainda não sabe. Cada linha é uma proposta com a
          evidência à vista — o sistema propõe, e quem decide é você.
          <span className="text-text-secondary"> Duas pessoas na mesma máquina não é conflito: é um posto compartilhado.</span>
        </p>
      </div>

      <PainelDeCobertura cobertura={cobertura} carregando={carregandoCobertura} />

      {/* A CONFIGURAÇÃO logo abaixo do painel, e não numa tela de ajustes: os
          cinco botões explicam os números que acabaram de ser lidos. "Por que
          tenho 12 fantasmas?" se responde mexendo em `ghostDays`, e separar as
          duas coisas em telas diferentes esconderia a resposta da pergunta. */}
      <ConfiguracaoDaDescoberta
        configuracao={configuracao}
        salvando={salvandoConfiguracao}
        onSalvar={handleSalvarConfiguracao}
      />

      {erro && (
        <div className="mb-4 border border-status-danger/40 bg-status-danger/5 px-4 py-3 flex items-start gap-3">
          <AlertCircle size={14} className="text-status-danger mt-0.5 shrink-0" />
          <p className="text-xs text-status-danger leading-relaxed flex-1">{erro}</p>
          <button type="button" onClick={limparErro} className="text-[10px] uppercase tracking-widest text-text-tertiary hover:text-text-primary">
            fechar
          </button>
        </div>
      )}

      <div className="flex items-center gap-1 border-b border-border-sutil mb-4 font-mono text-xs uppercase tracking-widest">
        {ABAS.map(({ id, rotulo }) => (
          <button
            key={id}
            type="button"
            onClick={() => setAba(id)}
            className={`px-4 py-2 border-b-2 -mb-px transition-colors ${
              aba === id ? 'border-status-success text-status-success' : 'border-transparent text-text-tertiary hover:text-text-primary'
            }`}
          >
            {rotulo}
            {id === 'fila' && sugestoes.length > 0 && (
              <span className="ml-2 text-[10px] text-text-tertiary">{sugestoes.length}</span>
            )}
          </button>
        ))}
      </div>

      {aba === 'fila' && (
        <>
          <div className="flex flex-wrap items-center gap-1 mb-4">
            {FILTROS.map(({ valor, rotulo }) => (
              <button
                key={rotulo}
                type="button"
                onClick={() => setFiltro(valor)}
                className={`px-3 py-1.5 text-[10px] font-mono uppercase tracking-widest border transition-colors ${
                  filtro === valor
                    ? 'border-text-primary text-text-primary'
                    : 'border-border-sutil text-text-tertiary hover:text-text-primary'
                }`}
              >
                {rotulo}
              </button>
            ))}
          </div>

          {carregandoSugestoes ? (
            <p className="text-text-tertiary text-xs font-mono">Carregando sugestões…</p>
          ) : sugestoes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-text-tertiary gap-3 border border-border-sutil">
              <Inbox size={24} className="opacity-50" />
              <span>Nada esperando decisão.</span>
              <span className="text-[10px] max-w-md text-center leading-relaxed">
                A varredura roda de hora em hora. Quando o agente encontrar uma máquina que
                casa com um ativo, ou alguém logado onde o cadastro não esperava, a proposta
                aparece aqui.
              </span>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {sugestoes.map((sugestao) => (
                <SugestaoCard
                  key={sugestao.id}
                  sugestao={sugestao}
                  postos={postos}
                  ocupado={ocupado}
                  onAceitar={handleAceitar}
                  onRecusar={handleRecusar}
                />
              ))}
            </div>
          )}
        </>
      )}

      {aba === 'orfaos' && <OrfaosTable orfaos={orfaos} ocupado={ocupado} onTriar={handleTriar} />}
      {aba === 'ociosos' && <OciososTable ociosos={ociosos} />}
    </div>
  );
}
