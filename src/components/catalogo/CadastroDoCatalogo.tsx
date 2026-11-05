import { Plus, type LucideIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import CatalogFormModal from './CatalogFormModal';
import CatalogTable from './CatalogTable';
import TipoFiltro from './TipoFiltro';
import type { CatalogUiSpec } from './catalog-ui.types';
import { useCatalog } from './useCatalog';
import EstadoDaLista from '../EstadoDaLista';
import ListToolbar from '../ListToolbar';
import PaginaCabecalho from '../PaginaCabecalho';
import { Button } from '../ui/button';
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs';
import { usePode } from '../../stores/auth.store';

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

  // DESATIVAR, EXCLUIR E A LIXEIRA são `SUPERVISOR` no servidor (AV). Configurações
  // inteira já é dele; o que muda é Colaboradores, que o Técnico cadastra e edita.
  // Sem o cargo, a lixeira nem aparece: ver o que foi excluído sem poder restaurar
  // seria uma vista de botões que faltam.
  const podeDecidir = usePode('SUPERVISOR');
  const comLixeira = spec.lixeira === true && podeDecidir;
  const acoes = podeDecidir ? spec.acoes : spec.acoes?.filter((acao) => !acao.alterna);

  // A FICHA não abre modal: é uma tela (`/colaboradores/:id`), para poder ser
  // aberta direto, colada de um chamado ou recarregada.
  const navigate = useNavigate();
  const abrirAcao: typeof openAcao = (id, registro) => {
    if (id === 'ficha' && caminhoDaFicha) navigate(caminhoDaFicha(registro.id));
    else openAcao(id, registro);
  };

  return (
    <div className="motion-safe:animate-fade-in flex flex-col pb-6">
      <PaginaCabecalho
        titulo={titulo}
        subtitulo={spec.descricao}
        acao={<Button onClick={openCreate}><Plus /> {spec.singular}</Button>}
      />

      {specs.length > 1 && (
        <Tabs value={spec.slug} onValueChange={changeTab} className="mb-4">
          <TabsList>
            {specs.map((item) => <TabsTrigger key={item.slug} value={item.slug}>{item.aba}</TabsTrigger>)}
          </TabsList>
        </Tabs>
      )}

      <ListToolbar
        {...(comLixeira ? { view, onViewChange: changeView } : {})}
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
        acoes={acoes}
        onEdit={openEdit}
        onDelete={podeDecidir ? handleDelete : undefined}
        onAcao={abrirAcao}
        onRestore={comLixeira && view === 'trashed' ? handleRestore : undefined}
        vazio={
          <div className="flex flex-col items-center justify-center">
            <Icone className="mb-3 size-6 opacity-50" />
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
                  <Button variant="link" onClick={openCreate} className="mt-2">
                    Cadastrar {spec.singular.toLowerCase()}
                  </Button>
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
