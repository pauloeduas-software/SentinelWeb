import {
  BatteryWarning, HelpCircle, Inbox, MonitorCheck, RefreshCw, type LucideIcon,
} from 'lucide-react';
import PaginaCabecalho from '../../components/PaginaCabecalho';
import { Button } from '../../components/ui/button';
import { ContagemDaAba, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import ConfiguracaoDaDescoberta from './components/ConfiguracaoDaDescoberta';
import OciososTable from './components/OciososTable';
import OrfaosTable from './components/OrfaosTable';
import PainelDeCobertura from './components/PainelDeCobertura';
import SugestoesLista from './components/SugestoesLista';
import VinculadasTable from './components/VinculadasTable';
import { useDescobertas, type AbaDaTela } from './hooks/useDescobertas';

// O QUE O AGENTE DESCOBRIU E O CADASTRO AINDA NÃO SABE
// (docs/decisoes/reconciliacao.md).
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

const ABAS: { id: AbaDaTela; rotulo: string; icone: LucideIcon }[] = [
  { id: 'fila', rotulo: 'Sugestões', icone: Inbox },
  { id: 'sem', rotulo: 'Sem vínculo', icone: HelpCircle },
  { id: 'com', rotulo: 'Vinculadas', icone: MonitorCheck },
  { id: 'ociosos', rotulo: 'Ociosos', icone: BatteryWarning },
];

export default function DescobertasPage() {
  const {
    aba, setAba,
    sugestoes, contagem, carregandoSugestoes, erroDasSugestoes, cobertura, carregandoCobertura, erroDaCobertura,
    ociosos, carregandoOciosos, erroDosOciosos, semVinculo, vinculadas, carregandoMaquinas, erroDasMaquinas, ocupado,
    configuracao, erroDaConfiguracao, salvandoConfiguracao, podeConfigurar,
    podeReconciliar, reconciliando, handleReconciliar,
    handleAceitar, handleRecusar, handleTriar, handleVincular, handleSalvarConfiguracao,
  } = useDescobertas();

  // O número ao lado do nome da aba.
  // RECONCILIAR AGORA (SUPERVISOR), na barra de cada lista. A varredura roda de hora em
  // hora e toma a janela da hora; quem cadastrou o ativo e quer ver a proposta nascer
  // não deveria esperar a hora virar.
  const reconciliar = podeReconciliar && (
    <Button variant="outline" disabled={reconciliando} onClick={handleReconciliar}>
      <RefreshCw className={reconciliando ? 'animate-spin' : undefined} />
      {reconciliando ? 'Varrendo…' : 'Reconciliar agora'}
    </Button>
  );

  return (
    <div className="motion-safe:animate-fade-in flex flex-col pb-6">

      <PaginaCabecalho titulo="Descobertas" />

      <PainelDeCobertura cobertura={cobertura} carregando={carregandoCobertura} erro={erroDaCobertura} horasDeShadow={configuracao?.shadowHours} />

      {/* A CONFIGURAÇÃO logo abaixo do painel, e não numa tela de ajustes: os
          botões explicam os números que acabaram de ser lidos. "Por que tenho
          12 fantasmas?" se responde mexendo em `ghostDays`, e separar as duas
          coisas em telas diferentes esconderia a resposta da pergunta. */}
      <ConfiguracaoDaDescoberta
        configuracao={configuracao}
        erro={erroDaConfiguracao}
        podeEditar={podeConfigurar}
        salvando={salvandoConfiguracao}
        onSalvar={handleSalvarConfiguracao}
      />

      <Tabs value={aba} onValueChange={(valor) => setAba(valor as AbaDaTela)}>
        <TabsList className="mb-4">
          {ABAS.map(({ id, rotulo, icone: Icone }) => (
            <TabsTrigger key={id} value={id}>
              <Icone /> {rotulo} <ContagemDaAba>{contagem[id]}</ContagemDaAba>
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="fila">
          <SugestoesLista
            sugestoes={sugestoes}
            carregando={carregandoSugestoes}
            erro={erroDasSugestoes}
            ocupado={ocupado}
            acao={reconciliar}
            onAceitar={handleAceitar}
            onRecusar={handleRecusar}
          />
        </TabsContent>

        <TabsContent value="sem">
          <OrfaosTable
            orfaos={semVinculo}
            carregando={carregandoMaquinas}
            erro={erroDasMaquinas}
            ocupado={ocupado}
            acao={reconciliar}
            onTriar={handleTriar}
            onVincular={handleVincular}
          />
        </TabsContent>

        <TabsContent value="com">
          <VinculadasTable maquinas={vinculadas} carregando={carregandoMaquinas} erro={erroDasMaquinas} acao={reconciliar} />
        </TabsContent>

        <TabsContent value="ociosos">
          <OciososTable ociosos={ociosos} carregando={carregandoOciosos} erro={erroDosOciosos} acao={reconciliar} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
