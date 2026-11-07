import { MapPin, Plus } from 'lucide-react';
import CartoesDeContagem from '../../components/CartoesDeContagem';
import ListaVazia from '../../components/ListaVazia';
import ListToolbar from '../../components/ListToolbar';
import PaginaCabecalho from '../../components/PaginaCabecalho';
import { Button } from '../../components/ui/button';
import OcupanteFormModal from './components/OcupanteFormModal';
import PostoFormModal from './components/PostoFormModal';
import PostosTable from './components/PostosTable';
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
    postos, total, contagens, carregando, erro, page, perPage, setPage, search, buscaFeita, changeSearch, view, escolherView,
    modalAberto, emEdicao, openCreate, openEdit, closeModal, handleSalvar, handleExcluir,
    emAdicao, openAdicao, closeAdicao, handleAdicionar,
    openDetalhe,
  } = usePostos();
  const podeCriar = usePode('SUPERVISOR');

  return (
    <div className="motion-safe:animate-fade-in flex flex-col pb-6">

      <PaginaCabecalho titulo="Postos" />

      <CartoesDeContagem contagens={contagens} escolhido={view} onEscolher={escolherView} />

      <ListToolbar
        search={search}
        onSearchChange={changeSearch}
        placeholder="Buscar por nome, nota, etiqueta ou série…"
        // O cadastro do posto é `SUPERVISOR`.
        acao={podeCriar && <Button onClick={openCreate}><Plus /> Novo posto</Button>}
        page={page}
        perPage={perPage}
        total={total}
        onPageChange={setPage}
      />

      <PostosTable
        postos={postos}
        onAbrir={openDetalhe}
        onAdicionar={openAdicao}
        podeEditar={podeCriar}
        onEditar={openEdit}
        onExcluir={(posto) => void handleExcluir(posto)}
        vazio={
          <ListaVazia
            icone={MapPin}
            carregando={carregando}
            erro={erro}
            nome="posto"
            busca={buscaFeita}
            filtrada={view !== 'todos'}
            onCadastrar={podeCriar ? openCreate : undefined}
          />
        }
      />

      {modalAberto && <PostoFormModal posto={emEdicao} onClose={closeModal} onSubmit={handleSalvar} />}

      {emAdicao && <OcupanteFormModal nomeDoPosto={emAdicao.name} onClose={closeAdicao} onSubmit={handleAdicionar} />}
    </div>
  );
}
