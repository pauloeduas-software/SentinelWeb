import { Plus } from 'lucide-react';
import EstadoDaLista from '../../components/EstadoDaLista';
import ListToolbar from '../../components/ListToolbar';
import PaginaCabecalho from '../../components/PaginaCabecalho';
import { Aviso } from '../../components/ui/aviso';
import { Button } from '../../components/ui/button';
import { Segmentado } from '../../components/ui/segmentado';
import PostoDetalheModal from './components/PostoDetalheModal';
import PostoFormModal from './components/PostoFormModal';
import PostosTable from './components/PostosTable';
import { VISOES, rotuloDaContagem } from './helpers/postos.helper';
import { usePostos } from './hooks/usePostos';
import { usePode } from '../../stores/auth.store';

// O POSTO DE TRABALHO — a MesaEscritório, a bancada, o guichê.
//
// É o coração do modelo de posse (docs/referencia/modelo-de-posse.md): quem
// está em cada mesa, o que foi entregue a ela, e se ela está vaga. E é aqui que
// o posto se CADASTRA — criar, editar e excluir, sem Desativar (AN) —, cada um
// dentro de uma localização de Configurações (decisão Y).
export default function PostosPage() {
  const {
    postos, total, carregando, erro, page, perPage, setPage, search, changeSearch, view, changeView,
    modalAberto, emEdicao, openCreate, openEdit, closeModal, handleSalvar, handleExcluir,
    postoId, postoAberto, openDetalhe, closeDetalhe, detalhe, detalhePendente, detalheErro, detalheInexistente,
    ocupantes,
    devolvendo, handleDevolver,
  } = usePostos();
  const podeCriar = usePode('SUPERVISOR');

  return (
    <div className="motion-safe:animate-fade-in flex flex-col pb-6">

      <PaginaCabecalho
        titulo="Postos"
        subtitulo={`${rotuloDaContagem(total, view)} · Quem ocupa responde pelo que foi entregue ao posto.`}
        // O cadastro do posto é `SUPERVISOR`.
        acao={podeCriar && <Button onClick={openCreate}><Plus /> Novo posto</Button>}
      />

      {/* O `/postos/:id` QUE NÃO ABRE, como o link quebrado do Estoque: a lista
          fica à vista, e Dispensar volta para `/postos`. O 404 já chega dizendo
          que o posto não existe; o resto (500, rede caída) não diz isso. */}
      {postoId && detalheErro && (
        <Aviso className="mb-4 flex items-center justify-between gap-4">
          <span>{detalheInexistente ? detalheErro : `Não foi possível abrir o posto: ${detalheErro}`}</span>
          <button type="button" onClick={closeDetalhe} className="text-xs hover:underline">Dispensar</button>
        </Aviso>
      )}

      {/* Os três recortes ficam FORA do ListToolbar: as abas dele são
          `Ativos|Lixeira` e falam de exclusão, enquanto estas falam de ocupação
          (docs/referencia/modelo-de-posse.md). Mesma forma visual, pergunta
          diferente. */}
      <Segmentado opcoes={VISOES} valor={view} onChange={changeView} className="mb-4" />

      <ListToolbar
        search={search}
        onSearchChange={changeSearch}
        placeholder="Buscar posto ou nota..."
        page={page}
        perPage={perPage}
        total={total}
        onPageChange={setPage}
      />

      <PostosTable
        postos={postos}
        onAbrir={openDetalhe}
        podeEditar={podeCriar}
        onEditar={openEdit}
        onExcluir={(posto) => void handleExcluir(posto)}
        vazio={
          <EstadoDaLista carregando={carregando} erro={erro}>
            {search ? (
              <span>Nenhum posto encontrado para "{search}".</span>
            ) : view === 'vagos' ? (
              <span>Nenhum posto vago. Todo equipamento entregue tem alguém respondendo por ele.</span>
            ) : view === 'ocupados' ? (
              <span>Nenhum posto ocupado no momento.</span>
            ) : (
              <>
                <span>Nenhum posto de trabalho cadastrado.</span>
                {/* "O botão acima" só existe para o SUPERVISOR (`podeCriar`): para
                    quem não é, apontar para um botão que não aparece seria
                    mandar procurar o que não está lá. */}
                <span className="text-xs">
                  {podeCriar
                    ? 'Crie a primeira mesa no botão acima.'
                    : 'Postos são criados por um supervisor: peça a um.'}
                </span>
              </>
            )}
          </EstadoDaLista>
        }
      />

      {/* `!postoId` porque a ficha e o formulário disputam a tela: com a URL de
          um posto e o formulário aberto pelo histórico do navegador, a ficha
          pintava em cima e fechá-la revelava o formulário ainda aberto por baixo. */}
      {modalAberto && !postoId && (
        <PostoFormModal posto={emEdicao} onClose={closeModal} onSubmit={handleSalvar} />
      )}

      {postoId && !detalheErro && (
        <PostoDetalheModal
          posto={postoAberto}
          detalhe={detalhe}
          carregando={detalhePendente}
          ocupantes={ocupantes.ocupantes}
          ocupantesCarregando={ocupantes.carregando}
          ocupantesErro={ocupantes.erro}
          view={ocupantes.view}
          onViewChange={ocupantes.changeView}
          onAdicionar={ocupantes.handleAdicionar}
          onEncerrar={ocupantes.handleEncerrar}
          onCorrigirTurno={ocupantes.handleCorrigirTurno}
          onDevolver={handleDevolver}
          devolvendo={devolvendo}
          onClose={closeDetalhe}
        />
      )}
    </div>
  );
}
