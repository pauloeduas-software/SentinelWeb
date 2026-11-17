import { HelpCircle, MonitorCheck, MonitorOff } from 'lucide-react';
import PaginaCabecalho from '../../components/PaginaCabecalho';
import VistasDaLista from '../../components/VistasDaLista';
import MaquinasTable from './components/MaquinasTable';
import PainelDeCobertura from './components/PainelDeCobertura';
import { useAgentes } from './hooks/useAgentes';
import { usePode } from '../../stores/auth.store';

// AS MÁQUINAS EM QUE O AGENTE ESTÁ INSTALADO, e qual computador cada uma é
// (docs/decisoes/reconciliacao.md, DC).
//
// A tela leva o nome do que LISTA, como a lista de Agentes do GLPI, e não o do
// processo que roda por trás. Não há fila nem varredura: a série que bate com um
// único computador liga as duas no handshake, e o que sobra é a máquina sem
// computador, para vincular à mão, e a sumida, para conferir e excluir (DD).
//
// Markup e mais nada: estado e chamadas ficam no `useAgentes`.

export default function AgentesPage() {
  const {
    vista, trocarVista, contagem, maquinas, carregando, erro,
    cobertura, erroDaCobertura, ocupado, handleVincular, handleDesvincular, handleAtualizar, handleExcluir,
  } = useAgentes();
  // Excluir é `SUPERVISOR` no servidor (AV), como todo excluir: o Técnico vincula
  // e desvincula, e não vê o item.
  const podeExcluir = usePode('SUPERVISOR');

  return (
    <div className="motion-safe:animate-fade-in flex flex-col pb-6">

      <PaginaCabecalho titulo="Agentes" />

      <PainelDeCobertura cobertura={cobertura} erro={erroDaCobertura} />

      <VistasDaLista
        valor={vista}
        onChange={trocarVista}
        vistas={[
          { valor: 'com', rotulo: 'Com computador', icone: MonitorCheck, contagem: contagem.com },
          { valor: 'sem', rotulo: 'Sem computador', icone: HelpCircle, contagem: contagem.sem },
          { valor: 'sumidos', rotulo: 'Sumidos', icone: MonitorOff, contagem: contagem.sumidos },
        ]}
      />

      <MaquinasTable
        vista={vista}
        lista={maquinas}
        carregando={carregando}
        erro={erro}
        ocupado={ocupado}
        onVincular={handleVincular}
        onDesvincular={(maquina) => void handleDesvincular(maquina)}
        onAtualizar={(maquina) => void handleAtualizar(maquina)}
        onExcluir={podeExcluir ? (maquina) => void handleExcluir(maquina) : undefined}
      />
    </div>
  );
}
