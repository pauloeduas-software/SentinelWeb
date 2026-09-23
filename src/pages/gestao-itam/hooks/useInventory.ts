import { useMemo, useState } from 'react';
import {
  useCreateInventoryItem,
  useDeleteInventoryItem,
  useInventoryQuery,
  useRestoreInventoryItem,
  useInventoryStatsQuery,
  useUpdateInventoryItem,
  type InventoryItemInput,
} from '../../../domain/inventory/inventory.queries';
import type { InventoryItem } from '../../../domain/shared/inventory.types';
import type { ListView } from '../../../domain/shared/list.types';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';

const PER_PAGE = 10;

export function useInventory() {
  // Página, busca e ordenação são estado de UMA tela: ficam aqui, em useState,
  // como o modal e o item em edição (docs/ARQUITETURA.md). Não é estado global
  // e não entra em store.
  const [page, setPage] = useState(1);
  const [view, setView] = useState<ListView>('active');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search);

  // Buscar com o usuário na página 5 deixaria a tela vazia sem explicação:
  // resultado novo começa sempre da primeira página.
  //
  // Zerar a página acontece AQUI, no mesmo handler que muda a busca, e não num
  // `useEffect` reagindo a ela: `setState` dentro de efeito encadeia renders e
  // o lint do react-hooks recusa (react.dev/learn/you-might-not-need-an-effect).
  const changeSearch = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const changeView = (proxima: ListView) => {
    setView(proxima);
    setPage(1);
  };

  const params = useMemo(
    () => ({ page, perPage: PER_PAGE, q: debouncedSearch || undefined, view }),
    [page, debouncedSearch, view],
  );

  // A busca e a invalidação depois de gravar são da query
  // (domain/inventory/inventory.queries.ts). Aqui fica só estado de tela.
  const { data, isPending } = useInventoryQuery(params);
  const { data: stats } = useInventoryStatsQuery();
  const createItem = useCreateInventoryItem();
  const updateItem = useUpdateInventoryItem();
  const deleteItem = useDeleteInventoryItem();
  const restoreItem = useRestoreInventoryItem();

  const items = data?.rows ?? [];
  const total = data?.total ?? 0;

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<InventoryItem | null>(null);

  const openCreate = () => {
    setEditing(null);
    setModalOpen(true);
  };

  const openEdit = (item: InventoryItem) => {
    setEditing(item);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
  };

  // O erro sobe para o formulário mostrar a mensagem do servidor
  const handleSubmit = async (data: InventoryItemInput) => {
    if (editing) await updateItem.mutateAsync({ id: editing.id, data });
    else await createItem.mutateAsync(data);
    closeModal();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja remover este item?')) return;
    try {
      await deleteItem.mutateAsync(id);
      // Apagar o último item da última página deixaria a tela vazia com o
      // usuário numa página que não existe mais.
      if (items.length === 1 && page > 1) setPage(page - 1);
    } catch (error) {
      alert(`Erro ao deletar item: ${(error as Error).message}`);
    }
  };

  const handleRestore = async (id: string) => {
    try {
      await restoreItem.mutateAsync(id);
      // Restaurar o último da página da lixeira deixaria a tela vazia
      if (items.length === 1 && page > 1) setPage(page - 1);
    } catch (error) {
      alert(`Erro ao restaurar item: ${(error as Error).message}`);
    }
  };

  return {
    items,
    total,
    // O contador do cabeçalho vem do /stats, não de `items.length`: com
    // paginação, o tamanho da página não é o tamanho do inventário.
    totalCadastrado: stats?.total ?? total,
    page,
    perPage: PER_PAGE,
    setPage,
    search,
    changeSearch,
    view,
    changeView,
    loading: isPending,
    modalOpen,
    editing,
    openCreate,
    openEdit,
    closeModal,
    handleSubmit,
    handleDelete,
    handleRestore,
  };
}
