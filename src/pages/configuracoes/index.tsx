import { useState } from 'react';
import { Plus, SlidersHorizontal } from 'lucide-react';
import CatalogFormModal from './components/CatalogFormModal';
import CatalogTable from './components/CatalogTable';
import LocationOccupantsModal from './components/LocationOccupantsModal';
import SistemaPanel from './components/SistemaPanel';
import ListToolbar from '../components/ListToolbar';
import { useCatalog } from './hooks/useCatalog';
import { useConfigDoSistema } from './hooks/useConfigDoSistema';
import { useOcupantes } from '../hooks/useOcupantes';

// As tabelas de catálogo do ITAM — o menu *Settings* do Snipe-IT.
//
// Uma tela para as NOVE tabelas, dirigida pelas specs de `specs/`: acrescentar
// uma tabela é escrever a spec, não copiar uma página.
//
// E UMA DÉCIMA ABA QUE NÃO É TABELA: *Sistema* (F10), que edita a LINHA ÚNICA do
// `AppSetting` — marca, formato e retenção do backup. Ela não cabe numa spec de
// catálogo (não tem listagem, nem paginação, nem botão de "novo"), então a
// página passa a ter duas formas e escolhe entre elas. É o mesmo desenho que
// `/relatorios` já usa para a aba de alertas: quatro abas de relatório mais uma
// de configuração, num tipo só.
export default function ConfiguracoesPage() {
  const {
    specs, spec, changeTab, registros, total, page, perPage, setPage,
    search, changeSearch, modalAberto, emEdicao,
    openCreate, openEdit, closeModal, handleSubmit, handleDelete,
    acaoAberta, openAcao, closeAcao,
  } = useCatalog();

  // As ações de linha declaradas pelas specs. Traduzir a ação genérica em "qual
  // posto" ou "qual conjunto" é trabalho DESTA tela: o `useCatalog` guarda QUAL
  // ação e SOBRE QUEM, e não sabe o que cada uma faz — assim uma ação nova não
  // mexe naquele arquivo.
  //
  // `useOcupantes` é compartilhado com /postos, que não tem ação de linha nenhuma
  // para conhecer.
  // QUAL DAS TRÊS FORMAS a tela está mostrando.
  //
  // Era um booleano (`emSistema`) enquanto havia duas; virou um modo quando
  // apareceu a terceira (Grupos), porque dois booleanos admitiriam o estado
  // impossível de os dois serem `true`. Grupos saiu no D148 e voltaram a ser
  // duas — o modo fica, porque é a forma que não admite o estado impossível.
  //
  // `useState` local porque é estado de UMA tela (docs/referencia/arquitetura.md), e fora
  // do `useCatalog` porque ele cuida da listagem de catálogo, que nestas duas
  // abas não existe.
  const [modo, setModo] = useState<'catalogo' | 'sistema'>('catalogo');
  const sistema = useConfigDoSistema();

  const posto = acaoAberta?.id === 'ocupantes' ? acaoAberta.registro : null;
  const ocupantes = useOcupantes(posto?.id ?? null);


  return (
    <div className="animate-in fade-in duration-300 h-[calc(100vh-4rem)] flex flex-col pb-6">

      <div className="flex justify-between items-end mb-6 shrink-0">
        <div>
          <h2 className="text-xl font-mono text-text-primary uppercase tracking-widest">Configurações</h2>
          <p className="text-xs text-text-tertiary mt-2 font-mono max-w-2xl">
            {modo === 'sistema'
              ? 'A identidade da empresa e como número e data aparecem na tela.'
              : spec.descricao}
          </p>
        </div>
        {/* Sem botão de "novo" na aba Sistema: ela edita uma linha que já
            existe e não pode ter uma segunda (o id é fixo, `singleton`). */}
        {modo === 'catalogo' && (
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 bg-text-primary text-bg-base hover:bg-text-secondary font-mono text-xs uppercase tracking-widest transition-colors shrink-0"
          >
            <Plus size={14} /> {spec.singular}
          </button>
        )}
      </div>

      <div className="flex flex-wrap border border-border-sutil font-mono text-xs mb-4 shrink-0">
        {specs.map((item) => (
          <button
            key={item.slug}
            type="button"
            onClick={() => { setModo('catalogo'); changeTab(item.slug); }}
            className={`px-4 py-2 uppercase tracking-widest transition-colors ${
              modo === 'catalogo' && item.slug === spec.slug
                ? 'bg-text-primary text-bg-base'
                : 'text-text-tertiary hover:text-text-primary hover:bg-bg-base'
            }`}
          >
            {item.aba}
          </button>
        ))}

        {/* AS DUAS ÚLTIMAS, separadas por uma borda: as nove primeiras são
            tabelas de catálogo; estas não são. Misturá-las sem marca nenhuma
            faria parecer que existe uma tabela chamada "Sistema". */}
        <button
          type="button"
          onClick={() => setModo('sistema')}
          className={`px-4 py-2 uppercase tracking-widest transition-colors border-l border-border-sutil ${
            modo === 'sistema'
              ? 'bg-text-primary text-bg-base'
              : 'text-text-tertiary hover:text-text-primary hover:bg-bg-base'
          }`}
        >
          Sistema
        </button>

      </div>

      {modo === 'sistema' ? (
        <SistemaPanel
          configuracao={sistema.configuracao}
          carregando={sistema.carregando}
          salvando={sistema.salvando}
          erro={sistema.erro}
          urlDaLogo={sistema.urlDaLogo}
          urlDoFavicon={sistema.urlDoFavicon}
          onSalvar={sistema.onSalvar}
          onSubirMarca={sistema.onSubirMarca}
          onLimparMarca={sistema.onLimparMarca}
        />
      ) : (
        <>
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

        </>
      )}


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
