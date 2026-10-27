import { Plus } from 'lucide-react';
import EstadoDaLista from '../components/EstadoDaLista';
import ListToolbar from '../components/ListToolbar';
import PostoDetalheModal from './components/PostoDetalheModal';
import PostoFormModal from './components/PostoFormModal';
import PostosTable from './components/PostosTable';
import { VISOES, rotuloDaContagem } from './helpers/postos.helper';
import { usePostos } from './hooks/usePostos';
import { usePode } from '../../domain/auth/auth.store';

// O POSTO DE TRABALHO — a MesaEscritório, a bancada, o guichê.
//
// É o coração do modelo de posse (docs/referencia/modelo-de-posse.md): quem
// está em cada mesa, o que foi entregue a ela, e se ela está vaga. E é aqui que
// o posto se CADASTRA — criar, editar, desativar e excluir —, cada um dentro
// de uma localização de Configurações (decisão Y).
export default function PostosPage() {
  const {
    postos, total, carregando, erro, page, perPage, setPage, search, changeSearch, view, changeView,
    modalAberto, emEdicao, openCreate, openEdit, closeModal, handleSalvar, handleAlternar, handleExcluir,
    postoId, postoAberto, openDetalhe, closeDetalhe, detalhe, detalhePendente, detalheErro, ocupantes,
    devolvendo, handleDevolver,
  } = usePostos();
  const podeCriar = usePode('ADMIN');

  return (
    <div className="motion-safe:animate-fade-in h-[calc(100vh-4rem)] flex flex-col pb-6">

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
        <div className="flex items-center gap-2 shrink-0">
          {/* O cadastro do posto é `ADMIN`. */}
          {podeCriar && (
            <button
              onClick={openCreate}
              className="flex items-center gap-2 px-4 py-2 bg-text-primary text-bg-base hover:bg-text-secondary font-mono text-xs uppercase tracking-widest transition-colors"
            >
              <Plus size={14} /> Novo posto
            </button>
          )}
        </div>
      </div>

      {/* Os três recortes ficam FORA do ListToolbar: as abas dele são
          `Ativos|Lixeira` e falam de exclusão, enquanto estas falam de ocupação
          (docs/referencia/modelo-de-posse.md). Mesma forma visual, pergunta diferente. */}
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
        onAlternar={(posto) => void handleAlternar(posto)}
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
                {/* "O botão acima" só existe para o ADMIN (`podeCriar`): para
                    quem não é, apontar para um botão que não aparece seria
                    mandar procurar o que não está lá. */}
                <span className="mt-4 text-[10px] max-w-md leading-relaxed">
                  {podeCriar
                    ? 'Crie a primeira mesa no botão acima. '
                    : 'Postos são criados por um administrador — peça a um. '}
                  Cada posto fica numa localização de Configurações — a Matriz, a Filial.
                </span>
              </>
            )}
          </EstadoDaLista>
        }
      />

      {/* `!postoId` porque a ficha e o formulário são os dois `fixed inset-0`
          no mesmo z-index: com a URL de um posto e o formulário aberto pelo
          histórico do navegador, a ficha pintava em cima e fechá-la revelava o
          formulário ainda aberto por baixo. */}
      {modalAberto && !postoId && (
        <PostoFormModal posto={emEdicao} onClose={closeModal} onSubmit={handleSalvar} />
      )}

      {postoId && detalheErro && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-bg-base/80 backdrop-blur-sm">
          <div className="w-full max-w-md bg-surface-card border border-border-sutil shadow-2xl p-6 font-mono text-xs space-y-4">
            <p className="text-text-primary uppercase tracking-widest">Posto não encontrado</p>
            <p className="text-text-tertiary leading-relaxed">{detalheErro}</p>
            <button
              type="button"
              onClick={closeDetalhe}
              className="px-4 py-2 border border-border-sutil text-text-secondary hover:text-text-primary hover:bg-bg-base uppercase tracking-widest transition-colors"
            >
              Voltar para a lista
            </button>
          </div>
        </div>
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
