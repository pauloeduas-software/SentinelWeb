import { Plus, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import CatalogFormModal from './CatalogFormModal';
import CatalogTable from './CatalogTable';
import TipoFiltro from './TipoFiltro';
import { tituloDoNovo, type CatalogUiSpec } from './catalog-ui.types';
import { useCatalog } from './useCatalog';
import ListaVazia from '../ListaVazia';
import ListToolbar from '../ListToolbar';
import PaginaCabecalho from '../PaginaCabecalho';
import VistasDaLista from '../VistasDaLista';
import { Button } from '../ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { comFiltros } from '../../hooks/useVoltaComFiltros';
import { usePode } from '../../stores/auth.store';

interface CadastroDoCatalogoProps {
  /** O nome da tela, no cabeçalho. */
  titulo: string;
  /** Os cadastros da tela. Com mais de um, cada um vira uma aba. */
  specs: readonly CatalogUiSpec[];
  /** Para onde leva a ação Ficha — só a tela cuja spec a declara precisa dar. */
  caminhoDaFicha?: (id: string) => string;
}

// UMA TELA DE CATÁLOGO, dirigida pelas specs que recebe: acrescentar uma tabela
// é escrever a spec, não copiar uma página. Configurações a usa com as seis
// abas de referência; Colaboradores, com uma só (decisão AH) — o mesmo
// cadastro, os mesmos botões e as mesmas frases, porque é o mesmo componente.
export default function CadastroDoCatalogo({ titulo, specs, caminhoDaFicha }: CadastroDoCatalogoProps) {
  const {
    spec, changeTab, registros, total, page, perPage, setPage, parametros,
    search, buscaFeita, changeSearch, tipo, changeTipo, view, changeView, loading, erro, padroesDoNovo, modalAberto, emEdicao,
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
    if (id === 'ficha' && caminhoDaFicha) navigate(caminhoDaFicha(registro.id), comFiltros(parametros));
    else openAcao(id, registro);
  };

  const novo = tituloDoNovo(spec);
  const nome = spec.singular.toLowerCase();

  const lista = (
    <>
      {comLixeira && (
        <VistasDaLista
          valor={view}
          onChange={changeView}
          vistas={[
            { valor: 'active', rotulo: spec.aba, icone: spec.icone },
            { valor: 'trashed', rotulo: 'Lixeira', icone: Trash2 },
          ]}
        />
      )}

      <ListToolbar
        search={search}
        onSearchChange={changeSearch}
        placeholder={spec.placeholderBusca}
        filtros={spec.filtroPorTipo && (
          <TipoFiltro opcoes={spec.filtroPorTipo.opcoes} valor={tipo} onChange={changeTipo} />
        )}
        acao={<Button onClick={openCreate}><Plus /> {novo}</Button>}
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
          <ListaVazia
            icone={spec.icone}
            carregando={loading}
            erro={erro}
            nome={nome}
            genero={spec.genero}
            busca={buscaFeita}
            frase={spec.lixeira && view === 'trashed' ? 'A lixeira está vazia.' : undefined}
            filtrada={Boolean(tipo)}
            onCadastrar={openCreate}
          />
        }
      />
    </>
  );

  return (
    <div className="motion-safe:animate-fade-in flex flex-col pb-6">
      <PaginaCabecalho titulo={titulo} />

      {specs.length > 1 ? (
        <Tabs value={spec.slug} onValueChange={changeTab}>
          <TabsList className="mb-4">
            {specs.map((item) => (
              <TabsTrigger key={item.slug} value={item.slug}>
                <item.icone />
                {item.aba}
              </TabsTrigger>
            ))}
          </TabsList>
          {/* Um painel por aba, para o `aria-controls` de cada uma apontar para algo: só o
              da aba ativa monta a lista. O `tabIndex` tira a parada invisível antes da busca. */}
          {specs.map((item) => (
            <TabsContent key={item.slug} value={item.slug} tabIndex={-1}>{lista}</TabsContent>
          ))}
        </Tabs>
      ) : lista}

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
