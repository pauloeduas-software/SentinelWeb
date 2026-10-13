import { Plus } from 'lucide-react';
import CategoriaFiltro from '../components/CategoriaFiltro';
import ListToolbar from '../components/ListToolbar';
import AjusteModal from './components/AjusteModal';
import EstoqueTable from './components/EstoqueTable';
import ItemDetalheModal from './components/ItemDetalheModal';
import ItemFormModal from './components/ItemFormModal';
import SaidaModal from './components/SaidaModal';
import { useEstoque } from './hooks/useEstoque';

// O ESTOQUE — monitor, teclado, mouse, cabo: o que tem QUANTIDADE e não
// patrimônio (docs/decisoes/estoque.md). Ativo é computador; o resto entra
// aqui, por quantidade.
//
// Markup e mais nada: estado e chamadas ficam no `useEstoque`
// (docs/referencia/arquitetura.md).
export default function EstoquePage() {
  const {
    itens, total, page, perPage, setPage, search, changeSearch, view, changeView,
    categoryId, changeCategoria,
    modal, itemAberto, abrir, fechar,
    handleCriar, handleEditar, handleAjustar, handleSaida, handleDevolver,
    handleExcluir, handleRestaurar,
  } = useEstoque();

  return (
    <div className="animate-in fade-in duration-300 flex flex-col pb-6">

      <div className="flex justify-between items-end mb-6 shrink-0">
        <div>
          <h2 className="text-xl font-mono text-text-primary uppercase tracking-widest">Estoque</h2>
          <p className="text-xs text-text-tertiary mt-2 font-mono max-w-2xl leading-relaxed">
            O que não é computador: monitor, teclado, mouse, cabo. N unidades intercambiáveis por
            item, entregues a um colaborador ou a um posto, e devolvidas uma a uma.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => abrir('criar')}
            className="flex items-center gap-2 px-4 py-2 bg-text-primary text-bg-base hover:bg-text-secondary font-mono text-xs uppercase tracking-widest transition-colors"
          >
            <Plus size={14} /> Novo item
          </button>
        </div>
      </div>

      <ListToolbar
        view={view}
        onViewChange={changeView}
        search={search}
        onSearchChange={changeSearch}
        placeholder="Buscar por nome..."
        filtros={<CategoriaFiltro tipo="STOCK" valor={categoryId} onChange={changeCategoria} />}
        page={page}
        perPage={perPage}
        total={total}
        onPageChange={setPage}
      />

      <EstoqueTable
        itens={itens}
        view={view}
        onAbrir={(item) => abrir('detalhe', item)}
        onAjustar={(item) => abrir('ajustar', item)}
        onSaida={(item) => abrir('saida', item)}
        onEditar={(item) => abrir('editar', item)}
        onExcluir={(item) => void handleExcluir(item)}
        onRestaurar={(item) => void handleRestaurar(item)}
        vazio={
          search ? (
            <span>Nenhum item encontrado para "{search}".</span>
          ) : categoryId ? (
            <span>Nenhum item nesta categoria.</span>
          ) : view === 'trashed' ? (
            <span>A lixeira de estoque está vazia.</span>
          ) : (
            <>
              <span>Nenhum item de estoque cadastrado.</span>
              <span className="mt-4 text-[10px] max-w-md text-center leading-relaxed">
                Um item é N unidades de uma mesma coisa — monitores, mouses, cabos. Cadastre-o com
                a quantidade que há hoje; o saldo disponível é calculado a partir das saídas.
              </span>
            </>
          )
        }
      />

      {modal === 'criar' && (
        <ItemFormModal item={null} onClose={fechar} onSubmit={handleCriar} />
      )}

      {modal === 'editar' && itemAberto && (
        <ItemFormModal item={itemAberto} onClose={fechar} onSubmit={handleEditar} />
      )}

      {modal === 'ajustar' && itemAberto && (
        <AjusteModal item={itemAberto} onClose={fechar} onSubmit={handleAjustar} />
      )}

      {modal === 'saida' && itemAberto && (
        <SaidaModal item={itemAberto} onClose={fechar} onSubmit={handleSaida} />
      )}

      {modal === 'detalhe' && itemAberto && (
        <ItemDetalheModal item={itemAberto} onClose={fechar} onDevolver={(movementId) => void handleDevolver(movementId)} />
      )}
    </div>
  );
}
