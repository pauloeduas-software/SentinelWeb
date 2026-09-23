import { useMemo, useState } from 'react';
import {
  useAdjustStockQuantity, useAttachComponent, useCheckinAccessory, useCheckoutAccessory,
  useConsumeConsumable, useCreateStockItem, useDeleteStockItem, useRestoreStockItem,
  useStockAlertsQuery, useStockListQuery, useUpdateStockItem,
  type AjusteInput, type EntregaInput, type ItemDeEstoqueInput,
} from '../../../domain/stock/stock.queries';
import type { ItemDeEstoque, StockSlug } from '../../../domain/shared/stock.types';
import type { ListView } from '../../../domain/shared/list.types';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { abaPorSlug } from '../helpers/estoque.helper';

const PER_PAGE = 15;

/** Qual janela está aberta. Uma de cada vez, como nas outras telas. */
export type ModalDeEstoque = 'criar' | 'editar' | 'ajustar' | 'saida' | 'detalhe' | null;

// Estado da tela de Estoque: que aba, que página, o que está na busca e qual
// item está aberto. Tudo de UMA tela — fica aqui, em `useState`, e não em store
// (docs/ARQUITETURA.md).
//
// AS TRÊS MUTAÇÕES DE SAÍDA são declaradas todas, sempre, mesmo com uma aba só
// visível: hook não pode ser condicional. Quem escolhe qual chamar é o
// `handleSaida`, olhando o slug — e as três são baratas de declarar, porque
// `useMutation` não dispara nada até alguém chamar `mutateAsync`.
export function useEstoque() {
  const [slug, setSlug] = useState<StockSlug>('accessories');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [view, setView] = useState<ListView>('active');
  const debouncedSearch = useDebouncedValue(search);

  // Zerar a página acontece no mesmo handler que muda o recorte, e não num
  // `useEffect` reagindo a ele: `setState` dentro de efeito encadeia renders e
  // o lint do react-hooks recusa.
  const changeSlug = (proximo: StockSlug) => {
    setSlug(proximo);
    setPage(1);
    setSearch('');
    setView('active');
  };

  const changeSearch = (valor: string) => {
    setSearch(valor);
    setPage(1);
  };

  const changeView = (proxima: ListView) => {
    setView(proxima);
    setPage(1);
  };

  const params = useMemo(
    () => ({ page, perPage: PER_PAGE, view, q: debouncedSearch || undefined }),
    [page, view, debouncedSearch],
  );

  const { data, isPending } = useStockListQuery(slug, params);
  // Nomeado aqui, e não só no `return`: os handlers de excluir e restaurar
  // precisam saber se estão apagando a ÚLTIMA linha da página.
  const itens = data?.rows ?? [];
  const { data: alertas } = useStockAlertsQuery();

  const criar = useCreateStockItem(slug);
  const editar = useUpdateStockItem(slug);
  const excluir = useDeleteStockItem(slug);
  const restaurar = useRestoreStockItem(slug);
  const ajustar = useAdjustStockQuantity(slug);

  const entregar = useCheckoutAccessory();
  const devolver = useCheckinAccessory();
  const consumir = useConsumeConsumable();
  const instalar = useAttachComponent();

  const [modal, setModal] = useState<ModalDeEstoque>(null);
  // O ITEM ABERTO é guardado como a LINHA inteira, não só o id: a janela
  // precisa do nome e do saldo para desenhar o cabeçalho no primeiro quadro, e
  // a consulta do detalhe chega depois. Guardar só o id faria a janela abrir
  // sem título.
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
  // aqui que aparecem o 409 de sem unidade disponível e o 422 de categoria do
  // tipo errado.
  const handleCriar = async (dados: ItemDeEstoqueInput) => {
    await criar.mutateAsync(dados);
    fechar();
  };

  const handleEditar = async (dados: ItemDeEstoqueInput) => {
    if (!itemAberto) return;
    await editar.mutateAsync({ id: itemAberto.id, data: dados });
    fechar();
  };

  const handleAjustar = async (dados: AjusteInput) => {
    if (!itemAberto) return;
    await ajustar.mutateAsync({ id: itemAberto.id, data: dados });
    fechar();
  };

  /**
   * A saída — e ela é uma operação DIFERENTE em cada aba, que é o que separa os
   * três tipos. O acessório vai para alguém e volta; o consumível some; o
   * componente entra num ativo.
   */
  const handleSaida = async (dados: Record<string, unknown>) => {
    if (!itemAberto) return;

    if (slug === 'accessories') {
      await entregar.mutateAsync({ id: itemAberto.id, data: dados as unknown as EntregaInput });
    } else if (slug === 'consumables') {
      await consumir.mutateAsync({
        id: itemAberto.id,
        data: dados as unknown as { userId: string; qty: number; notes?: string },
      });
    } else {
      await instalar.mutateAsync({
        id: itemAberto.id,
        data: dados as unknown as { assetId: string; qty: number; notes?: string },
      });
    }
    fechar();
  };

  // ─────────────────────────────────────────────────────────────────────────
  // AS TRÊS AÇÕES DE LISTA PRECISAM DO `try/catch`, e a falta dele era um bug.
  //
  // Elas não passam por formulário nenhum: o clique é direto na linha da
  // tabela, e não há campo de erro para a mensagem subir. Sem o `catch`, a
  // rejeição vira *unhandled rejection* no console e a tela **não faz nada** —
  // o operador clica em "Lixeira" num acessório com unidade na rua, nada
  // acontece, e ele clica de novo.
  //
  // O que se perde é justamente o que o servidor tem de melhor: o 409 daqui é
  // escrito para ENSINAR ("Este acessório ainda tem 3 unidades fora do
  // estoque. Faça a devolução antes de excluir."), e engoli-lo transforma uma
  // recusa explicada numa tela que parece travada.
  //
  // `alert` é o mesmo do `useAssets`/`useCatalog` — feio e consistente. Quando
  // o painel ganhar um toast, os três trocam juntos.
  // ─────────────────────────────────────────────────────────────────────────

  const handleDevolver = async (checkoutId: string) => {
    try {
      await devolver.mutateAsync({ checkoutId });
    } catch (erro) {
      // É aqui que aparece o 409 de unidade já devolvida — duas abas abertas
      // na mesma entrega, a segunda perde.
      alert((erro as Error).message);
    }
  };

  const handleExcluir = async (item: ItemDeEstoque) => {
    // Sem `confirm()`: o 409 do servidor já recusa o item com unidade fora, e
    // a exclusão aqui é para a LIXEIRA — reversível pela aba ao lado. Quem for
    // avisado duas vezes para uma ação reversível para de ler o aviso.
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
      // unicidade é índice PARCIAL, só entre os vivos, então nada impediu um
      // cadastro novo com o mesmo nome. Quem restaura precisa renomear um dos
      // dois, e o sistema não tem como escolher qual.
      alert((erro as Error).message);
    }
  };

  return {
    aba: abaPorSlug(slug),
    slug,
    changeSlug,

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

    alertas: alertas ?? { estoqueBaixo: [], postoVago: [] },

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
