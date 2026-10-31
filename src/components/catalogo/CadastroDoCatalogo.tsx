import { Plus, type LucideIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import CatalogFormModal from './CatalogFormModal';
import CatalogTable from './CatalogTable';
import TipoFiltro from './TipoFiltro';
import type { CatalogUiSpec } from './catalog-ui.types';
import { useCatalog } from './useCatalog';
import EstadoDaLista from '../EstadoDaLista';
import ListToolbar from '../ListToolbar';

interface CadastroDoCatalogoProps {
  /** O nome da tela, no cabeçalho. */
  titulo: string;
  /** O ícone da lista vazia — o mesmo do item do menu. */
  icone: LucideIcon;
  /** Os cadastros da tela. Com mais de um, cada um vira uma aba. */
  specs: readonly CatalogUiSpec[];
  /** Para onde leva a ação Ficha — só a tela cuja spec a declara precisa dar. */
  caminhoDaFicha?: (id: string) => string;
}

// UMA TELA DE CATÁLOGO, dirigida pelas specs que recebe: acrescentar uma tabela
// é escrever a spec, não copiar uma página. Configurações a usa com as cinco
// abas de referência; Colaboradores, com uma só (decisão AH) — o mesmo
// cadastro, os mesmos botões e as mesmas frases, porque é o mesmo componente.
export default function CadastroDoCatalogo({ titulo, icone: Icone, specs, caminhoDaFicha }: CadastroDoCatalogoProps) {
  const {
    spec, changeTab, registros, total, page, perPage, setPage,
    search, changeSearch, tipo, changeTipo, view, changeView, loading, erro, padroesDoNovo, modalAberto, emEdicao,
    openCreate, openEdit, closeModal, handleSubmit, handleDelete, handleRestore,
    openAcao,
  } = useCatalog(specs);

  // A FICHA não abre modal: é uma tela (`/colaboradores/:id`), para poder ser
  // aberta direto, colada de um chamado ou recarregada.
  const navigate = useNavigate();
  const abrirAcao: typeof openAcao = (id, registro) => {
    if (id === 'ficha' && caminhoDaFicha) navigate(caminhoDaFicha(registro.id));
    else openAcao(id, registro);
  };

  return (
    <div className="motion-safe:animate-fade-in h-[calc(100vh-4rem)] flex flex-col pb-6">

      <div className="flex justify-between items-end mb-6 shrink-0">
        <div>
          <h2 className="text-xl font-mono text-text-primary uppercase tracking-widest">{titulo}</h2>
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

      {specs.length > 1 && (
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
      )}

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
            <Icone size={24} className="mb-4 opacity-50" />
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
