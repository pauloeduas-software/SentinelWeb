import {
  History, Monitor, Package, Pencil, Trash2, UserPlus, Users,
} from 'lucide-react';
import { useParams } from 'react-router-dom';
import OcupanteFormModal from '../components/OcupanteFormModal';
import OccupantsPanel from '../components/OccupantsPanel';
import PostoFormModal from '../components/PostoFormModal';
import ComputadorTab from './components/ComputadorTab';
import EstoqueTab from './components/EstoqueTab';
import HistoricoTab from './components/HistoricoTab';
import IdentificacaoDoPosto from './components/IdentificacaoDoPosto';
import { useFichaDoPosto } from './hooks/useFichaDoPosto';
import AcoesDaLinha from '../../../components/AcoesDaLinha';
import { FichaIndisponivel } from '../../../components/CartaoDaFicha';
import ListToolbar from '../../../components/ListToolbar';
import PaginaCabecalho from '../../../components/PaginaCabecalho';
import { Button } from '../../../components/ui/button';
import {
  ContagemDaAba, Tabs, TabsContent, TabsList, TabsTrigger,
} from '../../../components/ui/tabs';
import { useAbaNaUrl } from '../../../hooks/useAbaNaUrl';
import { BUSCA_DA_FICHA } from '../../../hooks/useBuscaDaFicha';
import { POR_PAGINA } from '../../../hooks/useListaNaUrl';
import { rotuloDaVolta } from '../../../hooks/useVoltaComFiltros';
import { usePode } from '../../../stores/auth.store';

// A FICHA DO POSTO — `/postos/:id`: quem está nele, o que foi entregue a ele, como
// está a máquina que vive nele e, por último, o histórico.
//
// As duas metades do modelo numa tela só (docs/referencia/modelo-de-posse.md): os
// OCUPANTES (Camada 2, com turno) e os ATIVOS cuja posse aberta aponta para este
// posto (Camada 1 vista do lado do posto). É a junção das duas que responde "quem
// responde pelo mouse da Mesa 1" — e é por isso que as duas listas moram em abas da
// mesma ficha, não em telas separadas.
//
// PÁGINA, no molde da ficha do computador. Era janela sobre a lista para não perder
// a busca e a página em que se estava; agora elas moram na URL da lista
// (`usePostos`), e a seta volta com elas.
//
// Markup e mais nada: estado e chamadas ficam no `useFichaDoPosto`
// (docs/referencia/arquitetura.md).

const ABAS = ['responsaveis', 'computador', 'estoque', 'historico'] as const;

export default function PostoFichaPage() {
  const { id } = useParams<{ id: string }>();
  // Outro posto é outra ficha: busca e página não passam de um para o outro.
  return <FichaDoPosto key={id} />;
}

function FichaDoPosto() {
  const {
    posto, carregando, erro, voltar, voltaDoComputador, ocupantes, responsaveis,
    historico, totalDoHistorico, paginaDoHistorico, setPaginaDoHistorico, carregandoHistorico, erroDoHistorico,
    editando, abrirEdicao, fecharEdicao, adicionando, abrirAdicao, fecharAdicao, handleSalvar, handleExcluir,
  } = useFichaDoPosto();
  // O cadastro do posto é `SUPERVISOR`; quem é Técnico opera os ocupantes. Antes dos
  // `return` abaixo: hook depois de retorno condicional é o que as regras do React
  // proíbem.
  const podeEditar = usePode('SUPERVISOR');
  const [aba, setAba] = useAbaNaUrl(ABAS, BUSCA_DA_FICHA);
  const rotulo = rotuloDaVolta(voltar.para, 'Postos');

  if (carregando || erro || !posto) {
    return <FichaIndisponivel lista="Postos" rotuloDaVolta={rotulo} voltar={voltar} carregando={carregando} erro={erro ?? 'Posto não encontrado.'} />;
  }

  const totalDeUnidades = posto.itens.reduce((soma, entrega) => soma + entrega.unidades, 0);

  return (
    <div className="motion-safe:animate-fade-in pb-6">
      <PaginaCabecalho voltar={{ ...voltar, rotulo }} titulo={posto.name} />

      <div className="space-y-6">
        <IdentificacaoDoPosto
          posto={posto}
          voltaDoComputador={voltaDoComputador}
          acoes={(
            <>
              <Button size="sm" onClick={abrirAdicao}><UserPlus /> Adicionar ao posto</Button>
              {podeEditar && (
                <>
                  <Button variant="outline" size="sm" onClick={abrirEdicao}><Pencil /> Editar</Button>
                  <AcoesDaLinha
                    nome={posto.name}
                    acoes={[{ rotulo: 'Excluir', icone: Trash2, onClick: () => void handleExcluir(), perigo: true }]}
                  />
                </>
              )}
            </>
          )}
        />

        <Tabs value={aba} onValueChange={(valor) => setAba(valor as typeof aba)}>
          <TabsList>
            <TabsTrigger value="responsaveis"><Users /> Responsáveis <ContagemDaAba>{posto.totalOcupantes}</ContagemDaAba></TabsTrigger>
            <TabsTrigger value="computador"><Monitor /> Computador <ContagemDaAba>{posto.totalAtivos}</ContagemDaAba></TabsTrigger>
            <TabsTrigger value="estoque"><Package /> Estoque <ContagemDaAba>{totalDeUnidades}</ContagemDaAba></TabsTrigger>
            <TabsTrigger value="historico"><History /> Histórico <ContagemDaAba>{totalDoHistorico}</ContagemDaAba></TabsTrigger>
          </TabsList>

          <TabsContent value="responsaveis" className="mt-4 space-y-4">
            <ListToolbar
              search={responsaveis.busca}
              onSearchChange={responsaveis.mudarBusca}
              placeholder="Buscar por responsável ou turno…"
              page={responsaveis.page}
              perPage={POR_PAGINA}
              total={responsaveis.total}
              onPageChange={responsaveis.setPage}
            />
            <OccupantsPanel
              ocupantes={responsaveis.visiveis}
              carregando={ocupantes.carregando}
              erro={ocupantes.erro}
              vazio={responsaveis.buscaAdiada ? `Nenhum responsável com "${responsaveis.buscaAdiada}" neste posto.` : undefined}
              onEncerrar={ocupantes.handleEncerrar}
              onCorrigirTurno={ocupantes.handleCorrigirTurno}
            />
          </TabsContent>

          <TabsContent value="computador" className="mt-4 space-y-4">
            <ComputadorTab ativos={posto.ativos} />
          </TabsContent>

          <TabsContent value="estoque" className="mt-4 space-y-4">
            <EstoqueTab itens={posto.itens} nomeDoPosto={posto.name} />
          </TabsContent>

          <TabsContent value="historico" className="mt-4 space-y-4">
            <HistoricoTab
              eventos={historico}
              pagina={{ page: paginaDoHistorico, total: totalDoHistorico ?? 0, onPageChange: setPaginaDoHistorico }}
              carregando={carregandoHistorico}
              erro={erroDoHistorico}
            />
          </TabsContent>
        </Tabs>
      </div>

      {editando && <PostoFormModal posto={posto} onClose={fecharEdicao} onSubmit={handleSalvar} />}

      {adicionando && <OcupanteFormModal nomeDoPosto={posto.name} onClose={fecharAdicao} onSubmit={ocupantes.handleAdicionar} />}
    </div>
  );
}
