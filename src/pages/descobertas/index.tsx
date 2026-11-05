import { Inbox, RefreshCw } from 'lucide-react';
import EstadoDaLista from '../../components/EstadoDaLista';
import PaginaCabecalho from '../../components/PaginaCabecalho';
import { Aviso } from '../../components/ui/aviso';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
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
// `/itam` em favor de `/ativos` (hoje `/computadores`) — "ITAM" era o nome do assunto do sistema
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
    sugestoes, carregandoSugestoes, erroDasSugestoes, cobertura, carregandoCobertura,
    ociosos, erroDosOciosos, semVinculo, vinculadas, carregandoMaquinas, erroDasMaquinas, ocupado,
    configuracao, salvandoConfiguracao, podeConfigurar,
    podeReconciliar, reconciliando, ultimaVarredura, handleReconciliar,
    handleAceitar, handleRecusar, handleTriar, handleVincular, handleSalvarConfiguracao,
  } = useDescobertas();

  // O número ao lado do nome da aba.
  const contagem: Partial<Record<AbaDaTela, number>> = {
    fila: sugestoes.length,
    sem: semVinculo.length,
    com: vinculadas.length,
  };

  return (
    <div className="motion-safe:animate-fade-in flex flex-col pb-6">

      <PaginaCabecalho
        titulo="Descobertas"
        subtitulo="O que o agente vê e o cadastro ainda não sabe: o sistema propõe, e quem decide é você."
        // RECONCILIAR AGORA (SUPERVISOR). A varredura roda de hora em hora e toma
        // a janela da hora; quem cadastrou o ativo e quer ver a proposta nascer
        // não deveria esperar a hora virar. O placar fica ao lado do botão.
        acao={podeReconciliar && (
          <div className="flex flex-col items-end gap-1">
            <Button variant="outline" disabled={reconciliando} onClick={handleReconciliar}>
              <RefreshCw className={reconciliando ? 'animate-spin' : undefined} />
              {reconciliando ? 'Varrendo…' : 'Reconciliar agora'}
            </Button>
            {ultimaVarredura && (
              <span className="text-xs text-text-tertiary" aria-live="polite">
                {ultimaVarredura.endpoints} máquina{ultimaVarredura.endpoints === 1 ? '' : 's'} sem vínculo
                {' · '}{ultimaVarredura.sugeridas} sugest{ultimaVarredura.sugeridas === 1 ? 'ão' : 'ões'}
                {' · '}{ultimaVarredura.vinculadas} vínculo{ultimaVarredura.vinculadas === 1 ? '' : 's'}
                {' · '}{ultimaVarredura.encerradas} encerrada{ultimaVarredura.encerradas === 1 ? '' : 's'}
              </span>
            )}
          </div>
        )}
      />

      <PainelDeCobertura cobertura={cobertura} carregando={carregandoCobertura} horasDeShadow={configuracao?.shadowHours} />

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
        <Aviso className="mb-4 flex items-start justify-between gap-4">
          <span>{erro}</span>
          <button type="button" onClick={limparErro} className="shrink-0 text-xs hover:underline">Dispensar</button>
        </Aviso>
      )}

      <Tabs value={aba} onValueChange={(valor) => setAba(valor as AbaDaTela)}>
        <TabsList className="mb-4">
          {ABAS.map(({ id, rotulo }) => (
            <TabsTrigger key={id} value={id}>
              {rotulo}
              {Boolean(contagem[id]) && <span className="text-xs text-text-tertiary">{contagem[id]}</span>}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="fila">
          {sugestoes.length === 0 ? (
            <Card className="flex flex-col items-center justify-center gap-3 py-16 text-sm text-text-tertiary">
              <Inbox className="size-6 opacity-50" />
              <EstadoDaLista carregando={carregandoSugestoes} erro={erroDasSugestoes}>
                <span>Nada esperando decisão.</span>
                <span className="text-xs">A varredura roda de hora em hora.</span>
              </EstadoDaLista>
            </Card>
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
        </TabsContent>

        <TabsContent value="sem">
          <OrfaosTable
            orfaos={semVinculo}
            carregando={carregandoMaquinas}
            erro={erroDasMaquinas}
            ocupado={ocupado}
            onTriar={handleTriar}
            onVincular={handleVincular}
          />
        </TabsContent>

        <TabsContent value="com">
          <VinculadasTable maquinas={vinculadas} carregando={carregandoMaquinas} erro={erroDasMaquinas} />
        </TabsContent>

        <TabsContent value="ociosos">
          <OciososTable ociosos={ociosos} erro={erroDosOciosos} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
