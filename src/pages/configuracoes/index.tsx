import { Plus, SlidersHorizontal } from 'lucide-react';
import CatalogFormModal from './components/CatalogFormModal';
import CatalogTable from './components/CatalogTable';
import LocationOccupantsModal from './components/LocationOccupantsModal';
import ListToolbar from '../components/ListToolbar';
import { useCatalog } from './hooks/useCatalog';
import { useOcupantes } from '../hooks/useOcupantes';

// As tabelas de catálogo do ITAM — o menu *Settings* do Snipe-IT.
//
// Uma tela para as sete tabelas, dirigida pelas specs de `specs/`: acrescentar
// uma tabela é escrever a spec, não copiar uma página.
export default function ConfiguracoesPage() {
  const {
    specs, spec, changeTab, registros, total, page, perPage, setPage,
    search, changeSearch, modalAberto, emEdicao,
    openCreate, openEdit, closeModal, handleSubmit, handleDelete,
    acaoAberta, openAcao, closeAcao,
  } = useCatalog();

  // A ação de linha declarada pela spec de Localizações. Traduzir a ação
  // genérica em "qual posto" é trabalho DESTA tela: o hook é compartilhado com
  // /postos, que não tem ação de linha nenhuma para conhecer.
  const posto = acaoAberta?.id === 'ocupantes' ? acaoAberta.registro : null;
  const ocupantes = useOcupantes(posto?.id ?? null);

  return (
    <div className="animate-in fade-in duration-300 h-[calc(100vh-4rem)] flex flex-col pb-6">

      <div className="flex justify-between items-end mb-6 shrink-0">
        <div>
          <h2 className="text-xl font-mono text-text-primary uppercase tracking-widest">Configurações</h2>
          <p className="text-xs text-text-tertiary mt-2 font-mono max-w-2xl">{spec.descricao}</p>
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
        search={search}
        onSearchChange={changeSearch}
        placeholder={spec.placeholderBusca}
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
        onAcao={openAcao}
        vazio={
          <div className="flex flex-col items-center justify-center">
            <SlidersHorizontal size={24} className="mb-4 opacity-50" />
            {search ? (
              <span>Nada encontrado para "{search}".</span>
            ) : (
              <>
                <span>Nenhum registro em {spec.aba.toLowerCase()}.</span>
                <button onClick={openCreate} className="mt-4 text-status-success hover:underline">
                  Cadastrar {spec.singular.toLowerCase()}
                </button>
              </>
            )}
          </div>
        }
      />

      {modalAberto && (
        <CatalogFormModal
          spec={spec}
          registro={emEdicao}
          onClose={closeModal}
          onSubmit={handleSubmit}
        />
      )}

      {posto && (
        <LocationOccupantsModal
          posto={posto}
          ocupantes={ocupantes.ocupantes}
          carregando={ocupantes.carregando}
          view={ocupantes.view}
          onViewChange={ocupantes.changeView}
          onAdicionar={ocupantes.handleAdicionar}
          onEncerrar={ocupantes.handleEncerrar}
          onClose={closeAcao}
        />
      )}
    </div>
  );
}
