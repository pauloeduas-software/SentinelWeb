import { Plus } from 'lucide-react';
import ListToolbar from '../components/ListToolbar';
import AjusteModal from './components/AjusteModal';
import AlertasPanel from './components/AlertasPanel';
import ItemDetalheModal from './components/ItemDetalheModal';
import SaidaModal from './components/SaidaModal';
import StockFormModal from './components/StockFormModal';
import StockTable from './components/StockTable';
import { ABAS_DE_ESTOQUE } from './helpers/estoque.helper';
import { useEstoque } from './hooks/useEstoque';

// O ESTOQUE — os três tipos de item que TÊM QUANTIDADE (docs/FASE-5-PLANO-ITAM.md).
//
// UMA tela com três abas, e não três telas: os três compartilham a mesma
// invariante (o saldo é calculado, nunca coluna) e a mesma tabela. O que difere
// é o que acontece quando uma unidade SAI — e é só isso que muda entre as abas:
// o verbo do botão e o corpo do modal de saída.
//
// A régua contra o ativo, que a descrição de cada aba repete: **tem etiqueta
// própria → é Ativo**. A dock tem patrimônio e série, então mora em /itam. O
// pente de RAM não tem, então é componente aqui.
//
// Markup e mais nada: estado e chamadas ficam no `useEstoque`
// (docs/ARQUITETURA.md).
export default function EstoquePage() {
  const {
    aba, slug, changeSlug,
    itens, total, page, perPage, setPage, search, changeSearch, view, changeView,
    alertas,
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
            O que tem quantidade, e por isso não é ativo. Aqui uma linha são N unidades
            intercambiáveis; lá, uma linha é um equipamento com etiqueta e série.
            <span className="text-text-secondary"> A régua: tem etiqueta própria, é ativo.</span>
          </p>
        </div>
        <button
          onClick={() => abrir('criar')}
          className="flex items-center gap-2 px-4 py-2 bg-text-primary text-bg-base hover:bg-text-secondary font-mono text-xs uppercase tracking-widest transition-colors shrink-0"
        >
          <Plus size={14} /> Novo item
        </button>
      </div>

      {/* AS TRÊS ABAS, fora do ListToolbar: as dele são `Ativos|Lixeira` e
          falam de exclusão; estas falam de que TIPO de item se está olhando.
          Mesma forma visual, pergunta diferente — o mesmo arranjo de /postos. */}
      <div className="flex flex-wrap border border-border-sutil font-mono text-xs mb-3 w-fit shrink-0">
        {ABAS_DE_ESTOQUE.map((item) => (
          <button
            key={item.slug}
            type="button"
            onClick={() => changeSlug(item.slug)}
            className={`px-4 py-2 uppercase tracking-widest transition-colors ${
              item.slug === slug
                ? 'bg-text-primary text-bg-base'
                : 'text-text-tertiary hover:text-text-primary hover:bg-bg-base'
            }`}
          >
            {item.rotulo}
          </button>
        ))}
      </div>

      {/* O que a aba É, em uma linha. Sem isto, "onde cadastro o mouse?" não
          tem resposta na tela — e as três palavras (acessório, consumível,
          componente) só significam alguma coisa para quem já leu o modelo. */}
      <p className="font-mono text-[10px] text-text-tertiary mb-4 max-w-3xl leading-relaxed shrink-0">
        {aba.descricao}
      </p>

      <AlertasPanel alertas={alertas} />

      <ListToolbar
        view={view}
        onViewChange={changeView}
        search={search}
        onSearchChange={changeSearch}
        placeholder={`Buscar em ${aba.rotulo.toLowerCase()}, categoria ou fabricante...`}
        page={page}
        perPage={perPage}
        total={total}
        onPageChange={setPage}
      />

      <StockTable
        itens={itens}
        view={view}
        rotuloDaSaida={aba.acao}
        onAbrir={(item) => abrir('detalhe', item)}
        onEditar={(item) => abrir('editar', item)}
        onAjustar={(item) => abrir('ajustar', item)}
        onSaida={(item) => abrir('saida', item)}
        onExcluir={(item) => void handleExcluir(item)}
        onRestaurar={(item) => void handleRestaurar(item)}
        vazio={
          search ? (
            <span>Nenhum item encontrado para "{search}".</span>
          ) : view === 'trashed' ? (
            <span>A lixeira de {aba.rotulo.toLowerCase()} está vazia.</span>
          ) : (
            <>
              <span>Nenhum item em {aba.rotulo.toLowerCase()}.</span>
              <span className="mt-4 text-[10px] max-w-md text-center leading-relaxed">
                {aba.descricao}
              </span>
            </>
          )
        }
      />

      {modal === 'criar' && (
        <StockFormModal aba={aba} item={null} onClose={fechar} onSubmit={handleCriar} />
      )}

      {modal === 'editar' && itemAberto && (
        <StockFormModal aba={aba} item={itemAberto} onClose={fechar} onSubmit={handleEditar} />
      )}

      {modal === 'ajustar' && itemAberto && (
        <AjusteModal item={itemAberto} onClose={fechar} onSubmit={handleAjustar} />
      )}

      {modal === 'saida' && itemAberto && (
        <SaidaModal aba={aba} item={itemAberto} onClose={fechar} onSubmit={handleSaida} />
      )}

      {modal === 'detalhe' && itemAberto && (
        <ItemDetalheModal aba={aba} item={itemAberto} onClose={fechar} onDevolver={handleDevolver} />
      )}
    </div>
  );
}
