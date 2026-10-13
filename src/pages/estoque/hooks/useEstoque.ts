import { useMemo, useState } from 'react';
import {
  useAdjustStock, useCheckinStock, useCheckoutStock, useCreateStockItem, useDeleteStockItem,
  useRestoreStockItem, useStockQuery, useUpdateStockItem,
} from '../../../domain/stock/stock.queries';
import type {
  AjustarEstoqueInput, AlvoDaSaidaInput, CriarItemDeEstoqueInput, ItemDeEstoque,
} from '../../../domain/shared/stock.types';
import type { ListView } from '../../../domain/shared/list.types';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';

const PER_PAGE = 15;

/** Qual janela está aberta. Uma de cada vez, como nas outras telas. */
export type ModalDeEstoque = 'criar' | 'editar' | 'ajustar' | 'saida' | 'detalhe' | null;

// Estado da tela de Estoque: página, busca, vista e qual item está aberto.
// Tudo de UMA tela — `useState`, não store (docs/referencia/arquitetura.md).
export function useEstoque() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [view, setView] = useState<ListView>('active');
  const [categoryId, setCategoryId] = useState<string | undefined>();
  const debouncedSearch = useDebouncedValue(search);

  // Zerar a página no mesmo handler que muda o recorte, como no `useLicencas`:
  // `setState` dentro de efeito encadeia renders e o lint do react-hooks recusa.
  const changeSearch = (valor: string) => {
    setSearch(valor);
    setPage(1);
  };

  const changeView = (proxima: ListView) => {
    setView(proxima);
    setPage(1);
  };

  const changeCategoria = (id: string | undefined) => {
    setCategoryId(id);
    setPage(1);
  };

  const params = useMemo(
    () => ({ page, perPage: PER_PAGE, view, q: debouncedSearch || undefined, categoryId }),
    [page, view, debouncedSearch, categoryId],
  );

  const { data, isPending } = useStockQuery(params);
  const itens = data?.rows ?? [];

  const criar = useCreateStockItem();
  const editar = useUpdateStockItem();
  const excluir = useDeleteStockItem();
  const restaurar = useRestoreStockItem();
  const ajustar = useAdjustStock();
  const sair = useCheckoutStock();
  const devolver = useCheckinStock();

  const [modal, setModal] = useState<ModalDeEstoque>(null);
  // O ITEM ABERTO é a LINHA inteira, não só o id: a janela desenha nome e
  // saldo no primeiro quadro, e a consulta do detalhe chega depois.
  const [itemAberto, setItemAberto] = useState<ItemDeEstoque | null>(null);

  const abrir = (proximo: ModalDeEstoque, item: ItemDeEstoque | null = null) => {
    setItemAberto(item);
    setModal(proximo);
  };

  const fechar = () => {
    setModal(null);
    setItemAberto(null);
  };

  // Os erros sobem para o formulário mostrar a mensagem do servidor — é por
  // aqui que aparecem o 422 de categoria do tipo errado e o 409 de sem
  // unidade disponível.
  const handleCriar = async (dados: CriarItemDeEstoqueInput) => {
    await criar.mutateAsync(dados);
    fechar();
  };

  const handleEditar = async (dados: CriarItemDeEstoqueInput) => {
    if (!itemAberto) return;
    // Sem `qty`: o formulário de edição não a mostra, e o `PUT` nem a aceita
    // (`updateStockItemSchema` é `strictObject` — a chave desconhecida vira 422).
    await editar.mutateAsync({
      id: itemAberto.id,
      data: { name: dados.name, categoryId: dados.categoryId, notes: dados.notes },
    });
    fechar();
  };

  const handleAjustar = async (dados: AjustarEstoqueInput) => {
    if (!itemAberto) return;
    await ajustar.mutateAsync({ itemId: itemAberto.id, data: dados });
    fechar();
  };

  const handleSaida = async (alvo: AlvoDaSaidaInput) => {
    if (!itemAberto) return;
    await sair.mutateAsync({ itemId: itemAberto.id, alvo });
    fechar();
  };

  // A DEVOLUÇÃO fica aberta na janela de detalhe — ela não fecha o modal,
  // porque devolver uma unidade é o tipo de ação que se repete em sequência
  // (três mouses voltaram juntos) e fechar a cada clique obrigaria reabrir.
  const handleDevolver = async (movementId: string) => {
    try {
      await devolver.mutateAsync({ movementId });
    } catch (erro) {
      // O 409 de unidade já devolvida: duas abas na mesma ficha, a segunda perde.
      alert((erro as Error).message);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // EXCLUIR E RESTAURAR precisam do `try/catch`: o clique é direto na linha da
  // tabela e não há campo de erro para a mensagem subir. Sem ele a rejeição
  // vira *unhandled rejection* e a tela não faz nada — o 409 daqui ("item com
  // saída aberta") é escrito para ensinar, e engoli-lo parece tela travada.
  // ─────────────────────────────────────────────────────────────────────────

  const handleExcluir = async (item: ItemDeEstoque) => {
    try {
      await excluir.mutateAsync(item.id);
      // Última linha da página: volta uma, senão a tabela abre vazia com o
      // paginador apontando para uma página que não existe mais.
      if (itens.length === 1 && page > 1) setPage(page - 1);
    } catch (erro) {
      alert((erro as Error).message);
    }
  };

  const handleRestaurar = async (item: ItemDeEstoque) => {
    try {
      await restaurar.mutateAsync(item.id);
      if (itens.length === 1 && page > 1) setPage(page - 1);
    } catch (erro) {
      // O 409 de nome reaproveitado enquanto o item estava na lixeira: a
      // unicidade é índice PARCIAL, só entre os vivos.
      alert((erro as Error).message);
    }
  };

  return {
    itens,
    total: data?.total ?? 0,
    carregando: isPending,
    page,
    perPage: PER_PAGE,
    setPage,
    search,
    changeSearch,
    view,
    changeView,
    categoryId,
    changeCategoria,

    modal,
    itemAberto,
    abrir,
    fechar,

    handleCriar,
    handleEditar,
    handleAjustar,
    handleSaida,
    handleDevolver,
    handleExcluir,
    handleRestaurar,
  };
}
