import {
  Monitor, Package, Pencil, Trash2, Users,
} from 'lucide-react';
import OccupantsPanel from '../components/OccupantsPanel';
import PostoFormModal from '../components/PostoFormModal';
import { explicacaoDoVago } from '../helpers/postos.helper';
import ComputadorTab from './components/ComputadorTab';
import EstoqueTab from './components/EstoqueTab';
import IdentificacaoDoPosto from './components/IdentificacaoDoPosto';
import { useFichaDoPosto } from './hooks/useFichaDoPosto';
import AcoesDaLinha from '../../../components/AcoesDaLinha';
import { FichaIndisponivel } from '../../../components/CartaoDaFicha';
import PaginaCabecalho from '../../../components/PaginaCabecalho';
import { Aviso } from '../../../components/ui/aviso';
import { Button } from '../../../components/ui/button';
import {
  ContagemDaAba, Tabs, TabsContent, TabsList, TabsTrigger,
} from '../../../components/ui/tabs';
import { useAbaNaUrl } from '../../../hooks/useAbaNaUrl';
import { usePode } from '../../../stores/auth.store';

// A FICHA DO POSTO — `/postos/:id`: quem está nele, o que foi entregue a ele e como
// está a máquina que vive nele.
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

const ABAS = ['ocupantes', 'computador', 'estoque'] as const;

export default function PostoFichaPage() {
  const {
    posto, carregando, erro, voltar, ocupantes,
    editando, abrirEdicao, fecharEdicao, handleSalvar, handleExcluir,
    devolvendo, handleDevolver,
  } = useFichaDoPosto();
  // O cadastro do posto é `SUPERVISOR`; quem é Técnico opera os ocupantes. Antes dos
  // `return` abaixo: hook depois de retorno condicional é o que as regras do React
  // proíbem.
  const podeEditar = usePode('SUPERVISOR');
  const [aba, setAba] = useAbaNaUrl(ABAS);

  if (carregando || erro || !posto) {
    return <FichaIndisponivel lista="Postos" voltar={voltar} carregando={carregando} erro={erro ?? 'Posto não encontrado.'} />;
  }

  const totalDeUnidades = posto.itens.reduce((soma, entrega) => soma + entrega.unidades, 0);

  return (
    <div className="motion-safe:animate-fade-in pb-6">
      <PaginaCabecalho voltar={{ para: voltar, rotulo: 'Postos' }} titulo={posto.name} />

      <div className="space-y-6">
        <IdentificacaoDoPosto
          posto={posto}
          acoes={podeEditar && (
            <>
              <Button variant="outline" size="sm" onClick={abrirEdicao}><Pencil /> Editar</Button>
              <AcoesDaLinha
                nome={posto.name}
                acoes={[{ rotulo: 'Excluir', icone: Trash2, onClick: () => void handleExcluir(), perigo: true }]}
              />
            </>
          )}
        />

        <Tabs value={aba} onValueChange={(valor) => setAba(valor as typeof aba)}>
          <TabsList>
            <TabsTrigger value="ocupantes"><Users /> Ocupantes <ContagemDaAba>{posto.totalOcupantes}</ContagemDaAba></TabsTrigger>
            <TabsTrigger value="computador"><Monitor /> Computador <ContagemDaAba>{posto.totalAtivos}</ContagemDaAba></TabsTrigger>
            <TabsTrigger value="estoque"><Package /> Estoque <ContagemDaAba>{totalDeUnidades}</ContagemDaAba></TabsTrigger>
          </TabsList>

          <TabsContent value="ocupantes" className="mt-4 space-y-4">
            {posto.vago && (
              <Aviso tom="aviso">
                Posto vago: {explicacaoDoVago(posto)} Ou alguém assume o posto, ou o equipamento é devolvido.
              </Aviso>
            )}

            <OccupantsPanel
              nomeDoPosto={posto.name}
              ocupantes={ocupantes.ocupantes}
              carregando={ocupantes.carregando}
              erro={ocupantes.erro}
              view={ocupantes.view}
              onViewChange={ocupantes.changeView}
              onAdicionar={ocupantes.handleAdicionar}
              onEncerrar={ocupantes.handleEncerrar}
              onCorrigirTurno={ocupantes.handleCorrigirTurno}
            />
          </TabsContent>

          <TabsContent value="computador" className="mt-4 space-y-4">
            <ComputadorTab ativos={posto.ativos} onDevolver={handleDevolver} devolvendo={devolvendo} />
          </TabsContent>

          <TabsContent value="estoque" className="mt-4 space-y-4">
            <EstoqueTab itens={posto.itens} nomeDoPosto={posto.name} />
          </TabsContent>
        </Tabs>
      </div>

      {editando && <PostoFormModal posto={posto} onClose={fecharEdicao} onSubmit={handleSalvar} />}
    </div>
  );
}
