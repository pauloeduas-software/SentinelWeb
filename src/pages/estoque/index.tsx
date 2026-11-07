import { Package, Plus } from 'lucide-react';
import CartoesDeContagem from '../../components/CartoesDeContagem';
import CategoriaFiltro from '../../components/CategoriaFiltro';
import ListaVazia from '../../components/ListaVazia';
import ListToolbar from '../../components/ListToolbar';
import PaginaCabecalho from '../../components/PaginaCabecalho';
import { Button } from '../../components/ui/button';
import EntregaModal from './components/EntregaModal';
import EstoqueTable from './components/EstoqueTable';
import ItemFormModal from './components/ItemFormModal';
import { useEstoque } from './hooks/useEstoque';
import { usePode } from '../../stores/auth.store';

// O ESTOQUE — monitor, teclado, mouse, cabo: o que tem QUANTIDADE e não
// patrimônio (docs/decisoes/estoque.md). Ativo é computador; o resto entra
// aqui, por quantidade. A mesma lógica da licença (AE).
//
// Markup e mais nada: estado e chamadas ficam no `useEstoque`
// (docs/referencia/arquitetura.md). Sem abas: o desativado fica na lista, como
// nas Configurações.

export default function EstoquePage() {
  const {
    itens, total, carregando, erro, page, perPage, setPage, search, buscaFeita, changeSearch,
    categoryId, changeCategoria, status, escolherStatus, contagens,
    criando, abrirCriacao, fecharCriacao, abrirFicha,
    formulario, itemAberto, abrir, fechar, ocupado,
    handleCriar, handleEditar, handleEntregar, handleAlternarAtivo, handleExcluir,
  } = useEstoque();
  // Desativar e excluir são `SUPERVISOR` no servidor (AV). O Técnico cadastra,
  // edita, entrega e devolve.
  const podeDecidir = usePode('SUPERVISOR');

  return (
    <div className="motion-safe:animate-fade-in flex flex-col pb-6">

      <PaginaCabecalho titulo="Estoque" />

      <CartoesDeContagem contagens={contagens} escolhido={status} onEscolher={escolherStatus} />

      <ListToolbar
        search={search}
        onSearchChange={changeSearch}
        placeholder="Buscar por nome, categoria ou localização…"
        filtros={<CategoriaFiltro tipo="STOCK,COMPONENT,CONSUMABLE" valor={categoryId} onChange={changeCategoria} />}
        acao={<Button onClick={abrirCriacao}><Plus /> Novo item</Button>}
        page={page}
        perPage={perPage}
        total={total}
        onPageChange={setPage}
      />

      <EstoqueTable
        itens={itens}
        ocupado={ocupado}
        onAbrir={abrirFicha}
        onEntregar={(item) => abrir('entregar', item)}
        onEditar={(item) => abrir('editar', item)}
        onAlternarAtivo={podeDecidir ? (item) => void handleAlternarAtivo(item) : undefined}
        onExcluir={podeDecidir ? (item) => void handleExcluir(item) : undefined}
        vazio={
          <ListaVazia
            icone={Package}
            carregando={carregando}
            erro={erro}
            nome="item"
            busca={buscaFeita}
            filtrada={Boolean(categoryId || status)}
            onCadastrar={abrirCriacao}
          />
        }
      />

      {criando && (
        <ItemFormModal item={null} onClose={fecharCriacao} onSubmit={handleCriar} />
      )}

      {formulario === 'editar' && itemAberto && (
        <ItemFormModal item={itemAberto} onClose={fechar} onSubmit={handleEditar} />
      )}

      {formulario === 'entregar' && itemAberto && (
        <EntregaModal item={itemAberto} onClose={fechar} onSubmit={handleEntregar} />
      )}
    </div>
  );
}
