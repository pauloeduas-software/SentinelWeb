import { HelpCircle, Inbox, MonitorCheck, RefreshCw, Settings2, type LucideIcon } from 'lucide-react';
import PaginaCabecalho from '../../components/PaginaCabecalho';
import { Button } from '../../components/ui/button';
import { ContagemDaAba, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import ConfigurarDescobertaForm from './components/ConfigurarDescobertaForm';
import OrfaosTable from './components/OrfaosTable';
import PainelDeCobertura from './components/PainelDeCobertura';
import SugestoesTable from './components/SugestoesTable';
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
// A primeira vincula a um computador à mão, e entrega ao posto na mesma ida, porque a fila de sugestões só
// alcança a máquina que a cascata casou com alguma coisa; a que chegou com o
// serial em branco e um nome que não bate ficava aqui sem botão. A segunda
// desvincula: o vínculo mora nesta tela, e em nenhuma outra (BZ).
//
// Markup e mais nada: estado e chamadas ficam no `useDescobertas`.

const ABAS: { id: AbaDaTela; rotulo: string; icone: LucideIcon }[] = [
  { id: 'fila', rotulo: 'Sugestões', icone: Inbox },
  { id: 'sem', rotulo: 'Sem vínculo', icone: HelpCircle },
  { id: 'com', rotulo: 'Vinculadas', icone: MonitorCheck },
];

export default function DescobertasPage() {
  const {
    aba, setAba,
    sugestoes, contagem, carregandoSugestoes, erroDasSugestoes, cobertura, erroDaCobertura,
    semVinculo, vinculadas, carregandoMaquinas, erroDasMaquinas, ocupado,
    configuracao, erroDaConfiguracao, configurando, abrirConfiguracao, fecharConfiguracao,
    podeReconciliar, reconciliando, handleReconciliar,
    handleAceitar, handleRecusar, handleVincular, handleDesvincular, handleSalvarConfiguracao,
  } = useDescobertas();

  // OS BOTÕES DA TELA (SUPERVISOR), no fim da barra de cada lista. A varredura roda de
  // hora em hora e toma a janela da hora; quem cadastrou o ativo e quer ver a sugestão
  // nascer não deveria esperar a hora virar. A configuração fica ao lado (D118): o
  // prazo dela explica o Sumidos do topo.
  const acao = podeReconciliar && (
    <>
      <Button
        variant="outline"
        disabled={!configuracao}
        title={erroDaConfiguracao ? `Não foi possível carregar a configuração: ${erroDaConfiguracao}` : undefined}
        onClick={abrirConfiguracao}
      >
        <Settings2 /> Configurar
      </Button>
      <Button variant="outline" disabled={reconciliando} onClick={handleReconciliar}>
        <RefreshCw className={reconciliando ? 'animate-spin' : undefined} />
        {reconciliando ? 'Procurando…' : 'Procurar agora'}
      </Button>
    </>
  );

  return (
    <div className="motion-safe:animate-fade-in flex flex-col pb-6">

      <PaginaCabecalho titulo="Descobertas" />

      <PainelDeCobertura cobertura={cobertura} erro={erroDaCobertura} diasSemContato={configuracao?.ghostDays} />

      <Tabs value={aba} onValueChange={(valor) => setAba(valor as AbaDaTela)}>
        <TabsList className="mb-4">
          {ABAS.map(({ id, rotulo, icone: Icone }) => (
            <TabsTrigger key={id} value={id}>
              <Icone /> {rotulo} <ContagemDaAba>{contagem[id]}</ContagemDaAba>
            </TabsTrigger>
          ))}
        </TabsList>

        {/* O `tabIndex` tira a parada invisível antes da busca, como em Configurações. */}
        <TabsContent value="fila" tabIndex={-1}>
          <SugestoesTable
            sugestoes={sugestoes}
            carregando={carregandoSugestoes}
            erro={erroDasSugestoes}
            ocupado={ocupado}
            acao={acao}
            onAceitar={handleAceitar}
            onRecusar={handleRecusar}
          />
        </TabsContent>

        <TabsContent value="sem" tabIndex={-1}>
          <OrfaosTable
            orfaos={semVinculo}
            carregando={carregandoMaquinas}
            erro={erroDasMaquinas}
            ocupado={ocupado}
            acao={acao}
            onVincular={handleVincular}
          />
        </TabsContent>

        <TabsContent value="com" tabIndex={-1}>
          <VinculadasTable
            maquinas={vinculadas}
            carregando={carregandoMaquinas}
            erro={erroDasMaquinas}
            acao={acao}
            ocupado={ocupado}
            onDesvincular={(maquina) => void handleDesvincular(maquina)}
          />
        </TabsContent>
      </Tabs>

      {configurando && configuracao && (
        <ConfigurarDescobertaForm configuracao={configuracao} onSalvar={handleSalvarConfiguracao} onClose={fecharConfiguracao} />
      )}
    </div>
  );
}
