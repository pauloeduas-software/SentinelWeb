import { Plus } from 'lucide-react';
import CategoriaFiltro from '../components/CategoriaFiltro';
import EstadoDaLista from '../components/EstadoDaLista';
import ListToolbar from '../components/ListToolbar';
import EntregaModal from './components/EntregaModal';
import EstoqueTable from './components/EstoqueTable';
import ItemDetalheModal from './components/ItemDetalheModal';
import ItemFormModal from './components/ItemFormModal';
import { useEstoque } from './hooks/useEstoque';
import { usePode } from '../../domain/auth/auth.store';

// O ESTOQUE — monitor, teclado, mouse, cabo: o que tem QUANTIDADE e não
// patrimônio (docs/decisoes/estoque.md). Ativo é computador; o resto entra
// aqui, por quantidade. A mesma lógica da licença (AE).
//
// Markup e mais nada: estado e chamadas ficam no `useEstoque`
// (docs/referencia/arquitetura.md). Sem abas: o desativado fica na lista, como
// nas Configurações.

export default function EstoquePage() {
  const {
    itens, total, carregando, erro, page, perPage, setPage, search, changeSearch,
    categoryId, changeCategoria,
    modal, itemAberto, buscaDoLink, erroDoLink, abrir, fechar, ocupado,
    handleCriar, handleEditar, handleEntregar, handleDevolver, handleAlternarAtivo, handleExcluir,
  } = useEstoque();
  // Excluir é `ADMIN` no servidor.
  const podeApagar = usePode('ADMIN');

  return (
    <div className="motion-safe:animate-fade-in flex flex-col pb-6">

      <div className="flex justify-between items-end mb-6 shrink-0">
        <div>
          <h2 className="text-xl font-mono text-text-primary uppercase tracking-widest">Estoque</h2>
          <p className="text-xs text-text-tertiary mt-2 font-mono max-w-2xl leading-relaxed">
            O que não é computador: monitor, teclado, mouse, cabo. Cada item tem um total, e cada
            uso é uma entrega — a um colaborador ou a um posto.
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

      {erroDoLink && (
        <p role="alert" className="mb-4 p-3 bg-status-danger/10 text-status-danger border border-status-danger/20 font-mono text-xs flex justify-between gap-4">
          <span>Não foi possível abrir o item do link: {erroDoLink}</span>
          <button type="button" onClick={fechar} className="uppercase tracking-widest text-[10px] hover:underline">Dispensar</button>
        </p>
      )}

      <ListToolbar
        search={search}
        onSearchChange={changeSearch}
        placeholder="Buscar por nome, categoria ou localização..."
        filtros={<CategoriaFiltro tipo="STOCK" valor={categoryId} onChange={changeCategoria} />}
        page={page}
        perPage={perPage}
        total={total}
        onPageChange={setPage}
      />

      <EstoqueTable
        itens={itens}
        ocupado={ocupado}
        onAbrir={(item) => abrir('detalhe', item)}
        onEntregar={(item) => abrir('entregar', item)}
        onEditar={(item) => abrir('editar', item)}
        onAlternarAtivo={(item) => void handleAlternarAtivo(item)}
        onExcluir={podeApagar ? (item) => void handleExcluir(item) : undefined}
        vazio={
          // Carregando e erro antes do vazio: sem isto, a primeira carga e um
          // servidor fora do ar diziam "nenhum cadastrado" (`EstadoDaLista`).
          <EstadoDaLista carregando={carregando} erro={erro}>
            {search ? (
              <span>Nenhum item encontrado para "{search}".</span>
            ) : categoryId ? (
              <span>Nenhum item com este filtro.</span>
            ) : (
              <>
                <span>Nenhum item de estoque cadastrado.</span>
                <span className="mt-4 text-[10px] max-w-md text-center leading-relaxed">
                  Um item é N unidades de uma mesma coisa — monitores, mouses, cabos. Cadastre-o com
                  o total que há hoje e entregue a colaboradores ou postos até ele acabar.
                </span>
              </>
            )}
          </EstadoDaLista>
        }
      />

      {modal === 'criar' && (
        <ItemFormModal item={null} onClose={fechar} onSubmit={handleCriar} />
      )}

      {modal === 'editar' && itemAberto && (
        <ItemFormModal item={itemAberto} onClose={fechar} onSubmit={handleEditar} />
      )}

      {modal === 'entregar' && itemAberto && (
        <EntregaModal item={itemAberto} onClose={fechar} onSubmit={handleEntregar} />
      )}

      {modal === 'detalhe' && itemAberto && (
        <ItemDetalheModal
          // Outro item é outra janela: página e busca não passam de um para o outro.
          key={itemAberto.id}
          item={itemAberto}
          buscaInicial={buscaDoLink}
          ocupado={ocupado}
          onClose={fechar}
          onEntregar={(item) => abrir('entregar', item)}
          onEditar={(item) => abrir('editar', item)}
          onAlternarAtivo={(item) => void handleAlternarAtivo(item)}
          onExcluir={podeApagar ? (item) => void handleExcluir(item) : undefined}
          onDevolver={handleDevolver}
        />
      )}
    </div>
  );
}
