import { Cpu, Link2, Monitor, Trash2, Unlink } from 'lucide-react';
import { useParams } from 'react-router-dom';
import ComputadorTab from './components/ComputadorTab';
import IdentificacaoDaMaquina from './components/IdentificacaoDaMaquina';
import { useFichaDaMaquina } from './hooks/useFichaDaMaquina';
import VincularMaquinaForm from '../components/VincularMaquinaForm';
import AcoesDaLinha from '../../../components/AcoesDaLinha';
import { FichaIndisponivel } from '../../../components/CartaoDaFicha';
import PaginaCabecalho from '../../../components/PaginaCabecalho';
import TelemetriaDaMaquina from '../../../components/TelemetriaDaMaquina';
import { Button } from '../../../components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../../components/ui/tabs';
import { useAbaNaUrl } from '../../../hooks/useAbaNaUrl';
import { BUSCA_DA_FICHA } from '../../../hooks/useBuscaDaFicha';
import { rotuloDaVolta } from '../../../hooks/useVoltaComFiltros';
import { usePode } from '../../../stores/auth.store';

// A FICHA DA MÁQUINA — `/agentes/:id` (DF): o que a máquina diz de si no card, qual
// computador ela é e como ela está agora. É a página do host do Fleet e do NinjaOne,
// e a do agente do GLPI, no molde das outras fichas.
//
// O vínculo mora AQUI e na linha da lista (BZ): o computador e o posto mostram a
// máquina, e o Vincular, o Desvincular e o Excluir são desta tela.
//
// Markup e mais nada: estado e chamadas ficam no `useFichaDaMaquina`
// (docs/referencia/arquitetura.md).

const ABAS = ['computador', 'maquina'] as const;

export default function MaquinaFichaPage() {
  const { id } = useParams<{ id: string }>();
  // Outra máquina é outra ficha: o painel aberto não passa de uma para a outra.
  return <FichaDaMaquina key={id} />;
}

function FichaDaMaquina() {
  const {
    maquina, carregando, erro, voltar, ocupado, handleVincular,
    vinculando, abrirVinculo, fecharVinculo, handleDesvincular, handleExcluir,
  } = useFichaDaMaquina();
  // Excluir é `SUPERVISOR` no servidor (AV); vincular e desvincular, o Técnico faz.
  // Antes dos `return` abaixo: hook depois de retorno condicional é o que as regras
  // do React proíbem.
  const podeExcluir = usePode('SUPERVISOR');
  const [aba, setAba] = useAbaNaUrl(ABAS, BUSCA_DA_FICHA);
  const rotulo = rotuloDaVolta(voltar.para, 'Agentes');

  if (carregando || erro || !maquina) {
    return <FichaIndisponivel lista="Agentes" rotuloDaVolta={rotulo} voltar={voltar} carregando={carregando} erro={erro ?? 'Máquina não encontrada.'} />;
  }

  return (
    <div className="motion-safe:animate-fade-in pb-6">
      <PaginaCabecalho voltar={{ ...voltar, rotulo }} titulo={maquina.hostname} />

      <div className="space-y-6">
        <IdentificacaoDaMaquina
          maquina={maquina}
          acoes={maquina.asset ? (
            <Button variant="outline" size="sm" disabled={ocupado} onClick={() => void handleDesvincular()}><Unlink /> Desvincular</Button>
          ) : (
            <>
              <Button size="sm" disabled={ocupado} onClick={abrirVinculo}><Link2 /> Vincular</Button>
              {/* A máquina com computador desvincula antes de excluir (DD): o item nem aparece. */}
              {podeExcluir && (
                <AcoesDaLinha
                  nome={maquina.hostname}
                  acoes={[{ rotulo: 'Excluir', icone: Trash2, onClick: () => void handleExcluir(), disabled: ocupado, perigo: true }]}
                />
              )}
            </>
          )}
        />

        <Tabs value={aba} onValueChange={(valor) => setAba(valor as typeof aba)}>
          <TabsList>
            <TabsTrigger value="computador"><Monitor /> Computador</TabsTrigger>
            <TabsTrigger value="maquina"><Cpu /> Máquina</TabsTrigger>
          </TabsList>

          <TabsContent value="computador" className="mt-4 space-y-4">
            <ComputadorTab maquina={maquina} onVincular={abrirVinculo} />
          </TabsContent>

          <TabsContent value="maquina" className="mt-4 space-y-4">
            <TelemetriaDaMaquina endpointId={maquina.id} naFichaDaMaquina />
          </TabsContent>
        </Tabs>
      </div>

      {vinculando && (
        <VincularMaquinaForm maquina={maquina} ocupado={ocupado} onVincular={handleVincular} onCancelar={fecharVinculo} />
      )}
    </div>
  );
}
