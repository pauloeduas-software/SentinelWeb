import { useState } from 'react';
import { Plus, SlidersHorizontal } from 'lucide-react';
import CatalogFormModal from './components/CatalogFormModal';
import CatalogTable from './components/CatalogTable';
import FieldsetFieldsModal from './components/FieldsetFieldsModal';
import LocationOccupantsModal from './components/LocationOccupantsModal';
import SistemaPanel from './components/SistemaPanel';
import GruposPanel from './components/GruposPanel';
import DiretorioPanel from './components/DiretorioPanel';
import GrupoFormModal from './components/GrupoFormModal';
import ListToolbar from '../components/ListToolbar';
import { useCatalog } from './hooks/useCatalog';
import { useConjuntoDeCampos } from './hooks/useConjuntoDeCampos';
import { useConfigDoSistema } from './hooks/useConfigDoSistema';
import { useGrupos } from './hooks/useGrupos';
import { useOcupantes } from '../hooks/useOcupantes';
import { usePode } from '../../domain/auth/auth.store';

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
  // Era um booleano (`emSistema`) enquanto havia duas. Com a terceira (Grupos,
  // F11) um segundo booleano criaria o estado impossível de os dois serem
  // `true` — e alguém escreveria o `if` que decide qual ganha. Um modo só não
  // admite o estado impossível.
  //
  // `useState` local porque é estado de UMA tela (docs/ARQUITETURA.md), e fora
  // do `useCatalog` porque ele cuida da listagem de catálogo, que nestas duas
  // abas não existe.
  const [modo, setModo] = useState<'catalogo' | 'sistema' | 'grupos'>('catalogo');
  const sistema = useConfigDoSistema();
  const grupos = useGrupos();

  // A aba Grupos é toda `access.manage`: as seis rotas por trás dela exigem a
  // chave, e a tela não teria o que mostrar sem ela.
  const podeGerenciarAcesso = usePode('access.manage');

  const posto = acaoAberta?.id === 'ocupantes' ? acaoAberta.registro : null;
  const ocupantes = useOcupantes(posto?.id ?? null);

  // A SEGUNDA ação do projeto (F9): a composição de um conjunto de campos. Os
  // dois hooks são chamados sempre, com `null` quando a ação não é a deles — é o
  // que as regras de hooks exigem, e é por isso que os dois aceitam `null`.
  const conjunto = acaoAberta?.id === 'campos-do-conjunto' ? acaoAberta.registro : null;
  const campos = useConjuntoDeCampos(conjunto?.id ?? null);

  return (
    <div className="animate-in fade-in duration-300 h-[calc(100vh-4rem)] flex flex-col pb-6">

      <div className="flex justify-between items-end mb-6 shrink-0">
        <div>
          <h2 className="text-xl font-mono text-text-primary uppercase tracking-widest">Configurações</h2>
          <p className="text-xs text-text-tertiary mt-2 font-mono max-w-2xl">
            {modo === 'sistema'
              ? 'A identidade da empresa, como número e data aparecem na tela, e quanto tempo o backup fica no disco.'
              : modo === 'grupos'
                ? 'Quem alcança o quê. Permissão efetiva é a união dos grupos da pessoa — não existe negação por grupo.'
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
        {modo === 'grupos' && (
          <button
            onClick={grupos.openCreate}
            className="flex items-center gap-2 px-4 py-2 bg-text-primary text-bg-base hover:bg-text-secondary font-mono text-xs uppercase tracking-widest transition-colors shrink-0"
          >
            <Plus size={14} /> Grupo
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

        {/* GRUPOS (F11) só aparece para quem tem `access.manage` — todas as
            rotas por trás dela exigem essa chave, e uma aba que responde 403
            inteira é pior do que uma aba a menos.

            Isto NÃO é a segurança: quem garante é o `preHandler` do servidor. */}
        {podeGerenciarAcesso && (
          <button
            type="button"
            onClick={() => setModo('grupos')}
            className={`px-4 py-2 uppercase tracking-widest transition-colors border-l border-border-sutil ${
              modo === 'grupos'
                ? 'bg-text-primary text-bg-base'
                : 'text-text-tertiary hover:text-text-primary hover:bg-bg-base'
            }`}
          >
            Grupos
          </button>
        )}
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
      ) : modo === 'grupos' ? (
        <>
          <ListToolbar
            search={grupos.search}
            onSearchChange={grupos.changeSearch}
            placeholder="Buscar grupo por nome"
            page={grupos.page}
            perPage={grupos.perPage}
            total={grupos.total}
            onPageChange={grupos.setPage}
          />

          <GruposPanel
            grupos={grupos.grupos}
            carregando={grupos.carregando}
            onEditar={grupos.openEdit}
            onApagar={(grupo) => { void grupos.handleDelete(grupo.id); }}
          />

          {/* O DIRETÓRIO fica na MESMA aba dos grupos, e não numa própria (F11,
              Etapa I): as duas coisas respondem "quem entra e com o que" — grupo
              concede, diretório traz quem. Uma aba só para um botão seria a quinta
              aba desta tela, e a pessoa que vem conferir acesso é a mesma que vem
              conferir a sincronização.

              Quem não tem `settings.manage` vê o painel e toma 403 no clique: o
              botão não é escondido porque o resultado da sincronização interessa a
              quem administra acesso, mesmo sem poder disparar. */}
          <DiretorioPanel />
        </>
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

      {grupos.modalAberto && (
        <GrupoFormModal
          // `key` para o formulário RENASCER a cada grupo: ele guarda o estado
          // das caixas em `useState` inicializado pela prop, e sem a chave o
          // React reaproveitaria a instância — abrir o segundo grupo mostraria
          // as permissões do primeiro.
          key={grupos.emEdicao?.id ?? 'novo'}
          grupo={grupos.emEdicao}
          porModulo={grupos.porModulo}
          salvando={grupos.salvando}
          onFechar={grupos.closeModal}
          onSalvar={grupos.handleSubmit}
        />
      )}

      {modalAberto && (
        <CatalogFormModal
          spec={spec}
          registro={emEdicao}
          onClose={closeModal}
          onSubmit={handleSubmit}
        />
      )}

      {conjunto && (
        <FieldsetFieldsModal
          nome={campos.nome || String(conjunto.name)}
          modelosAlcancados={campos.modelosAlcancados}
          rascunho={campos.rascunho}
          disponiveis={campos.disponiveis}
          carregando={campos.carregando}
          salvando={campos.salvando}
          sujo={campos.sujo}
          erro={campos.erro}
          onAcrescentar={campos.acrescentar}
          onRemover={campos.remover}
          onAlternarObrigatorio={campos.alternarObrigatorio}
          onDefinirPadrao={campos.definirPadrao}
          onMover={campos.mover}
          onDescartar={campos.descartar}
          onGravar={campos.gravar}
          onClose={closeAcao}
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
