import { AlertCircle, Inbox, RefreshCw } from 'lucide-react';
import ConfiguracaoDaDescoberta from './components/ConfiguracaoDaDescoberta';
import OciososTable from './components/OciososTable';
import OrfaosTable from './components/OrfaosTable';
import PainelDeCobertura from './components/PainelDeCobertura';
import SugestaoCard from './components/SugestaoCard';
import VinculadasTable from './components/VinculadasTable';
import { useDescobertas, type AbaDaTela } from './hooks/useDescobertas';

// O QUE O AGENTE DESCOBRIU E O CADASTRO AINDA NÃO SABE
// (docs/historico/fase-07-convergencia-rmm-itam.md).
//
// A tela se chama DESCOBERTAS, e não "Reconciliação": ela leva o nome do que
// LISTA, não o do processo que roda por trás. É a mesma correção que aposentou
// `/itam` em favor de `/ativos` — "ITAM" era o nome do assunto do sistema
// inteiro, não daquela tela.
//
// AS DUAS LISTAS DE MÁQUINAS, separadas pelo vínculo: o que o agente vê e o
// cadastro não sabe ("Sem vínculo"), e o que já é patrimônio ("Vinculadas").
// A primeira tem as duas ações que faltavam — vincular a um ativo à mão, e
// vincular e entregar ao posto numa ida só —, porque a fila de sugestões só
// alcança a máquina que a cascata casou com alguma coisa; a que chegou com o
// serial em branco e um nome que não bate ficava aqui sem botão.
//
// Markup e mais nada: estado e chamadas ficam no `useDescobertas`.

const ABAS: { id: AbaDaTela; rotulo: string }[] = [
  { id: 'fila', rotulo: 'Sugestões' },
  { id: 'sem', rotulo: 'Sem vínculo' },
  { id: 'com', rotulo: 'Vinculadas' },
  { id: 'ociosos', rotulo: 'Ociosos' },
];

export default function DescobertasPage() {
  const {
    aba, setAba, erro, limparErro,
    sugestoes, carregandoSugestoes, cobertura, carregandoCobertura,
    ociosos, semVinculo, vinculadas, carregandoMaquinas, ocupado,
    configuracao, salvandoConfiguracao, podeConfigurar,
    podeReconciliar, reconciliando, ultimaVarredura, handleReconciliar,
    handleAceitar, handleRecusar, handleTriar, handleVincular, handleSalvarConfiguracao,
  } = useDescobertas();

  return (
    <div className="animate-in fade-in duration-300 flex flex-col pb-6">

      <div className="mb-6 shrink-0 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-mono text-text-primary uppercase tracking-widest">Descobertas</h2>
          <p className="text-xs text-text-tertiary mt-2 font-mono max-w-3xl leading-relaxed">
            O que o agente vê e o cadastro ainda não sabe. Cada linha é uma proposta com a
            evidência à vista — o sistema propõe, e quem decide é você.
          </p>
        </div>

        {/* RECONCILIAR AGORA (ADMIN). A varredura roda de hora em hora e toma
            a janela da hora; quem cadastrou o ativo e quer ver a proposta nascer
            não deveria esperar a hora virar. O placar fica ao lado do botão. */}
        {podeReconciliar && (
          <div className="flex flex-col items-end gap-1 font-mono text-[10px]">
            <button
              type="button"
              disabled={reconciliando}
              onClick={handleReconciliar}
              className="flex items-center gap-2 px-4 py-2 border border-border-sutil text-text-secondary hover:text-text-primary hover:bg-bg-base uppercase tracking-widest transition-colors disabled:opacity-40"
            >
              <RefreshCw size={12} className={reconciliando ? 'animate-spin' : ''} />
              {reconciliando ? 'Varrendo…' : 'Reconciliar agora'}
            </button>
            {ultimaVarredura && (
              <span className="text-text-tertiary" aria-live="polite">
                {ultimaVarredura.endpoints} máquina{ultimaVarredura.endpoints === 1 ? '' : 's'} sem vínculo
                {' · '}{ultimaVarredura.sugeridas} sugest{ultimaVarredura.sugeridas === 1 ? 'ão' : 'ões'}
                {' · '}{ultimaVarredura.vinculadas} vínculo{ultimaVarredura.vinculadas === 1 ? '' : 's'}
                {' · '}{ultimaVarredura.encerradas} encerrada{ultimaVarredura.encerradas === 1 ? '' : 's'}
              </span>
            )}
          </div>
        )}
      </div>

      <PainelDeCobertura cobertura={cobertura} carregando={carregandoCobertura} />

      {/* A CONFIGURAÇÃO logo abaixo do painel, e não numa tela de ajustes: os
          botões explicam os números que acabaram de ser lidos. "Por que tenho
          12 fantasmas?" se responde mexendo em `ghostDays`, e separar as duas
          coisas em telas diferentes esconderia a resposta da pergunta. */}
      <ConfiguracaoDaDescoberta
        configuracao={configuracao}
        podeEditar={podeConfigurar}
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
            {id === 'sem' && semVinculo.length > 0 && (
              <span className="ml-2 text-[10px] text-text-tertiary">{semVinculo.length}</span>
            )}
            {id === 'com' && vinculadas.length > 0 && (
              <span className="ml-2 text-[10px] text-text-tertiary">{vinculadas.length}</span>
            )}
          </button>
        ))}
      </div>

      {aba === 'fila' && (
        <>
          {carregandoSugestoes ? (
            <p className="text-text-tertiary text-xs font-mono">Carregando sugestões…</p>
          ) : sugestoes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-text-tertiary gap-3 border border-border-sutil">
              <Inbox size={24} className="opacity-50" />
              <span>Nada esperando decisão.</span>
              <span className="text-[10px] max-w-md text-center leading-relaxed">
                A varredura roda de hora em hora. Quando o agente encontrar uma máquina
                cuja identidade de hardware casa com um ativo do cadastro, a proposta
                aparece aqui.
              </span>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {sugestoes.map((sugestao) => (
                <SugestaoCard
                  key={sugestao.id}
                  sugestao={sugestao}
                  ocupado={ocupado}
                  onAceitar={handleAceitar}
                  onRecusar={handleRecusar}
                />
              ))}
            </div>
          )}
        </>
      )}

      {aba === 'sem' && (
        <OrfaosTable
          orfaos={semVinculo}
          carregando={carregandoMaquinas}
          ocupado={ocupado}
          onTriar={handleTriar}
          onVincular={handleVincular}
        />
      )}
      {aba === 'com' && <VinculadasTable maquinas={vinculadas} carregando={carregandoMaquinas} />}
      {aba === 'ociosos' && <OciososTable ociosos={ociosos} />}
    </div>
  );
}
