import { Plus, SlidersHorizontal } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import CatalogFormModal from './components/CatalogFormModal';
import CatalogTable from './components/CatalogTable';
import TipoFiltro from './components/TipoFiltro';
import EstadoDaLista from '../components/EstadoDaLista';
import ListToolbar from '../components/ListToolbar';
import { useCatalog } from './hooks/useCatalog';

// As tabelas de catálogo do ITAM — o menu *Settings* do Snipe-IT.
//
// Uma tela para as SEIS tabelas, dirigida pelas specs de `specs/`: acrescentar
// uma tabela é escrever a spec, não copiar uma página.
export default function ConfiguracoesPage() {
  const {
    specs, spec, changeTab, registros, total, page, perPage, setPage,
    search, changeSearch, tipo, changeTipo, view, changeView, loading, erro, padroesDoNovo, modalAberto, emEdicao,
    openCreate, openEdit, closeModal, handleSubmit, handleDelete, handleRestore,
    openAcao,
  } = useCatalog();

  // A FICHA não abre modal: é uma tela (`/configuracoes/colaboradores/:id`),
  // para poder ser aberta direto, colada de um chamado ou recarregada.
  const navigate = useNavigate();
  const abrirAcao: typeof openAcao = (id, registro) => {
    if (id === 'ficha') navigate(`/configuracoes/colaboradores/${registro.id}`);
    else openAcao(id, registro);
  };

  return (
    <div className="motion-safe:animate-fade-in h-[calc(100vh-4rem)] flex flex-col pb-6">

      <div className="flex justify-between items-end mb-6 shrink-0">
        <div>
          <h2 className="text-xl font-mono text-text-primary uppercase tracking-widest">Configurações</h2>
          <p className="text-xs text-text-tertiary mt-2 font-mono max-w-2xl">
            {spec.descricao}
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-text-primary text-bg-base hover:bg-text-secondary font-mono text-xs uppercase tracking-widest transition-colors shrink-0"
        >
          <Plus size={14} /> {spec.singular}
        </button>
      </div>

      <div className="flex flex-wrap border border-border-sutil font-mono text-xs mb-4 shrink-0">
        {specs.map((item) => (
          <button
            key={item.slug}
            type="button"
            onClick={() => changeTab(item.slug)}
            className={`px-4 py-2 uppercase tracking-widest transition-colors ${
              item.slug === spec.slug
                ? 'bg-text-primary text-bg-base'
                : 'text-text-tertiary hover:text-text-primary hover:bg-bg-base'
            }`}
          >
            {item.aba}
          </button>
        ))}
      </div>

      <ListToolbar
        {...(spec.lixeira ? { view, onViewChange: changeView } : {})}
        search={search}
        onSearchChange={changeSearch}
        placeholder={spec.placeholderBusca}
        filtros={spec.filtroPorTipo && (
          <TipoFiltro opcoes={spec.filtroPorTipo.opcoes} valor={tipo} onChange={changeTipo} />
        )}
        page={page}
        perPage={perPage}
        total={total}
        onPageChange={setPage}
      />

      <CatalogTable
        colunas={spec.colunas}
        registros={registros}
        acoes={spec.acoes}
        onEdit={openEdit}
        onDelete={handleDelete}
        onAcao={abrirAcao}
        onRestore={spec.lixeira && view === 'trashed' ? handleRestore : undefined}
        vazio={
          <div className="flex flex-col items-center justify-center">
            <SlidersHorizontal size={24} className="mb-4 opacity-50" />
            <EstadoDaLista carregando={loading} erro={erro}>
              {spec.lixeira && view === 'trashed' ? (
                <span>A lixeira está vazia.</span>
              ) : search ? (
                <span>Nada encontrado para "{search}".</span>
              ) : tipo ? (
                <span>Nada cadastrado neste tipo.</span>
              ) : (
                <>
                  <span>Nenhum registro em {spec.aba.toLowerCase()}.</span>
                  <button onClick={openCreate} className="mt-4 text-status-success hover:underline">
                    Cadastrar {spec.singular.toLowerCase()}
                  </button>
                </>
              )}
            </EstadoDaLista>
          </div>
        }
      />

      {modalAberto && (
        <CatalogFormModal
          spec={spec}
          registro={emEdicao}
          padroes={padroesDoNovo}
          onClose={closeModal}
          onSubmit={handleSubmit}
        />
      )}
    </div>
  );
}
