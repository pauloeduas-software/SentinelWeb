import { useMemo, useState } from 'react';
import {
  useCreateUser,
  useDeleteUser,
  useUpdateUser,
  useUsersQuery,
  useRestoreUser,
  type UserInput,
} from '../../../domain/user/user.queries';
import type { User } from '../../../domain/shared/user.types';
import type { ListView } from '../../../domain/shared/list.types';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useNotificacao } from '../../hooks/useNotificacao';

const PER_PAGE = 10;

export function useUsers() {
  const notificar = useNotificacao();
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
  // (domain/user/user.queries.ts). Aqui fica só estado de tela.
  const { data, isPending, error } = useUsersQuery(params);
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const deleteUser = useDeleteUser();
  const restoreUser = useRestoreUser();

  const users = data?.rows ?? [];
  const total = data?.total ?? 0;

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);

  const openCreate = () => {
    setEditing(null);
    setModalOpen(true);
  };

  const openEdit = (user: User) => {
    setEditing(user);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
  };

  // O erro sobe para o formulário mostrar a mensagem do servidor
  const handleSubmit = async (data: UserInput) => {
    if (editing) await updateUser.mutateAsync({ id: editing.id, data });
    else await createUser.mutateAsync(data);
    closeModal();
  };

  // EXCLUIR, e o confirm diz o que isso quer dizer AQUI: vai para a lixeira e
  // volta pelo Restaurar. É o terceiro do trio Editar/Desativar/Excluir — e o
  // texto precisa separá-lo do Desativar, que é o que se usa para quem saiu da
  // empresa. "Tem certeza que deseja remover?" não dizia nem quem nem para onde.
  const handleDelete = async (user: User) => {
    if (!confirm(`Excluir "${user.name}"? Vai para a lixeira e pode ser restaurado.`)) return;
    try {
      await deleteUser.mutateAsync(user.id);
      if (users.length === 1 && page > 1) setPage(page - 1);
    } catch (error) {
      notificar.erro(`Erro ao deletar usuário: ${(error as Error).message}`);
    }
  };

  // DESATIVAR É UM BOTÃO DA LINHA, não uma caixa no formulário — o padrão das
  // listas do sistema (as cinco abas de Configurações também). Desativar não apaga: a pessoa fica
  // no cadastro e no histórico, só não recebe entrega nova nem entra mais. A
  // confirmação é só na ida; reativar não tem o que perder.
  const handleAlternarAtivo = async (user: User) => {
    if (user.isActive && !confirm(
      `Desativar "${user.name}"? Continua no cadastro e no histórico, mas não recebe equipamento novo nem entra no sistema.`,
    )) return;

    try {
      await updateUser.mutateAsync({ id: user.id, data: { isActive: !user.isActive } });
    } catch (error) {
      notificar.erro((error as Error).message);
    }
  };

  const handleRestore = async (id: string) => {
    try {
      await restoreUser.mutateAsync(id);
      // Restaurar o último da página da lixeira deixaria a tela vazia
      if (users.length === 1 && page > 1) setPage(page - 1);
    } catch (error) {
      notificar.erro(`Erro ao restaurar usuário: ${(error as Error).message}`);
    }
  };

  return {
    users,
    total,
    page,
    perPage: PER_PAGE,
    setPage,
    search,
    changeSearch,
    view,
    changeView,
    loading: isPending,
    // Para a tabela não dizer "nenhum usuário cadastrado" quando a consulta
    // falhou — e oferecer cadastrar o primeiro (`EstadoDaLista`).
    erro: error ? error.message : null,
    modalOpen,
    editing,
    openCreate,
    openEdit,
    closeModal,
    handleSubmit,
    handleDelete,
    handleRestore,
    handleAlternarAtivo,
  };
}
