import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import ListToolbar from '../components/ListToolbar';
import PostoDetalheModal from './components/PostoDetalheModal';
import PostoFormModal from './components/PostoFormModal';
import PostosTable from './components/PostosTable';
import { VISOES, rotuloDaContagem } from './helpers/postos.helper';
import { usePostos } from './hooks/usePostos';

// O POSTO DE TRABALHO — a Mesa 1, a bancada, o guichê.
//
// É o coração do modelo de posse (docs/MODELO-POSSE.md) e estava invisível:
// montar a Mesa 1 com Laura de manhã e Ana à tarde exigia Configurações → 6ª
// aba → achar a linha → um ícone pequeno de pessoas. Esta tela é a superfície
// que faltava; o modelo não mudou — o posto continua sendo uma `Location`
// marcada com `isWorkstation` (D15), e nenhuma tabela nasceu para ela.
export default function PostosPage() {
  const {
    postos, total, page, perPage, setPage, search, changeSearch, view, changeView,
    modalAberto, openCreate, closeModal, handleCriar,
    postoAberto, openDetalhe, closeDetalhe, detalhe, detalhePendente, ocupantes,
  } = usePostos();

  return (
    <div className="animate-in fade-in duration-300 h-[calc(100vh-4rem)] flex flex-col pb-6">

      <div className="flex justify-between items-end mb-6 shrink-0">
        <div>
          <h2 className="text-xl font-mono text-text-primary uppercase tracking-widest">Postos</h2>
          <p className="text-xs text-text-tertiary mt-2 font-mono max-w-2xl leading-relaxed">
            A mesa, a bancada, o guichê. Quem ocupa um posto responde por todos os ativos
            entregues a ele — vários ocupantes, em turnos diferentes, são o caso normal.
            <span className="text-text-secondary"> Posto vago</span> é posto com equipamento e
            sem ninguém respondendo por ele.
          </p>
          <div className="mt-2 font-mono text-xs text-text-tertiary tabular-nums">
            {rotuloDaContagem(total, view)}
          </div>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-text-primary text-bg-base hover:bg-text-secondary font-mono text-xs uppercase tracking-widest transition-colors shrink-0"
        >
          <Plus size={14} /> Novo posto
        </button>
      </div>

      {/* Os três recortes ficam FORA do ListToolbar: as abas dele são
          `Ativos|Lixeira` e falam de exclusão, enquanto estas falam de ocupação
          (docs/MODELO-POSSE.md). Mesma forma visual, pergunta diferente. */}
      <div className="flex flex-wrap border border-border-sutil font-mono text-xs mb-4 w-fit shrink-0">
        {VISOES.map((visao) => (
          <button
            key={visao.valor}
            type="button"
            onClick={() => changeView(visao.valor)}
            className={`px-4 py-2 uppercase tracking-widest transition-colors ${
              visao.valor === view
                ? 'bg-text-primary text-bg-base'
                : 'text-text-tertiary hover:text-text-primary hover:bg-bg-base'
            }`}
          >
            {visao.rotulo}
          </button>
        ))}
      </div>

      <ListToolbar
        search={search}
        onSearchChange={changeSearch}
        placeholder="Buscar posto, nota ou a sala onde ele fica..."
        page={page}
        perPage={perPage}
        total={total}
        onPageChange={setPage}
      />

      <PostosTable
        postos={postos}
        onAbrir={openDetalhe}
        vazio={
          search ? (
            <span>Nenhum posto encontrado para "{search}".</span>
          ) : view === 'vagos' ? (
            <span>Nenhum posto vago. Todo equipamento entregue tem alguém respondendo por ele.</span>
          ) : view === 'ocupados' ? (
            <span>Nenhum posto ocupado no momento.</span>
          ) : (
            <>
              <span>Nenhum posto de trabalho cadastrado.</span>
              {/* A dica é necessária: quem já criou "Mesa 1" como localização
                  antes desta tela existir não a encontra aqui, porque a marca
                  de posto nasce desmarcada. Sem isto, a tela pareceria quebrada
                  justamente para quem tem mais dado. */}
              <span className="mt-4 text-[10px] max-w-md leading-relaxed">
                Crie a primeira mesa no botão acima. Se você já tem localizações que são mesas,
                marque "é posto de trabalho" nelas em{' '}
                <Link to="/configuracoes" className="text-status-success hover:underline">
                  Configurações › Localizações
                </Link>
                {' '}e elas aparecem aqui.
              </span>
            </>
          )
        }
      />

      {modalAberto && <PostoFormModal onClose={closeModal} onSubmit={handleCriar} />}

      {postoAberto && (
        <PostoDetalheModal
          posto={postoAberto}
          detalhe={detalhe}
          carregando={detalhePendente}
          ocupantes={ocupantes.ocupantes}
          ocupantesCarregando={ocupantes.carregando}
          view={ocupantes.view}
          onViewChange={ocupantes.changeView}
          onAdicionar={ocupantes.handleAdicionar}
          onEncerrar={ocupantes.handleEncerrar}
          onClose={closeDetalhe}
        />
      )}
    </div>
  );
}
