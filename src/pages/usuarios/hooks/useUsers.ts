import { useMemo, useState } from 'react';
import {
  useCreateUser,
  useDeleteUser,
  useResetUserPassword,
  useUpdateUser,
  useUsersQuery,
  type UserInput,
} from '../../../queries/user.queries';
import type { User } from '../../../types/user.types';
import { useDebouncedValue } from '../../../hooks/useDebouncedValue';
import { useNotificacao } from '../../../hooks/useNotificacao';

const PER_PAGE = 10;

export function useUsers() {
  const notificar = useNotificacao();
  const [page, setPage] = useState(1);
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

  const params = useMemo(
    () => ({ page, perPage: PER_PAGE, q: debouncedSearch || undefined }),
    [page, debouncedSearch],
  );

  // A busca e a invalidação depois de gravar são da query
  // (queries/user.queries.ts). Aqui fica só estado de tela.
  const { data, isPending, error } = useUsersQuery(params);
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const deleteUser = useDeleteUser();
  const resetPassword = useResetUserPassword();

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

  // O erro sobe para o formulário mostrar a mensagem do servidor. O CADASTRO
  // não fecha a janela: devolve a senha temporária da conta nova (AU), que o
  // formulário mostra uma vez; quem fecha é o administrador, depois de copiá-la.
  const handleSubmit = async (data: UserInput): Promise<string | null> => {
    if (!editing) return (await createUser.mutateAsync(data)).temporaryPassword;
    await updateUser.mutateAsync({ id: editing.id, data });
    closeModal();
    return null;
  };

  // EXCLUIR, e o confirm diz o que isso quer dizer AQUI: não tem volta — errou,
  // cadastra de novo. É o terceiro do trio Editar/Desativar/Excluir — e o texto
  // precisa separá-lo do Desativar, que é o que se usa para quem saiu da
  // empresa. "Tem certeza que deseja remover?" não dizia nem quem nem o quê.
  const handleDelete = async (user: User) => {
    if (!confirm(`Excluir "${user.name}"? Não tem como desfazer.`)) return;
    try {
      await deleteUser.mutateAsync(user.id);
      if (users.length === 1 && page > 1) setPage(page - 1);
    } catch (error) {
      notificar.erro((error as Error).message);
    }
  };

  // DESATIVAR É UM BOTÃO DA LINHA, não uma caixa no formulário — o padrão das
  // listas do sistema (Configurações e Colaboradores também). Desativar não
  // apaga: a conta fica na lista, só não entra mais. A confirmação é só na ida;
  // reativar não tem o que perder.
  const handleAlternarAtivo = async (user: User) => {
    if (user.isActive && !confirm(
      `Desativar "${user.name}"? A conta continua na lista, mas não entra mais no sistema.`,
    )) return;

    try {
      await updateUser.mutateAsync({ id: user.id, data: { isActive: !user.isActive } });
    } catch (error) {
      notificar.erro((error as Error).message);
    }
  };

  // A SENHA TEMPORÁRIA (AR): de quem esqueceu a sua. Gerar invalida a senha de hoje
  // e derruba as sessões abertas da conta NA HORA, então o confirm diz isso. A
  // senha volta uma vez só, para o formulário mostrar; o erro sobe para ele.
  const handleGerarSenhaTemporaria = async (user: User): Promise<string | null> => {
    if (!confirm(
      `Gerar uma senha temporária para "${user.name}"? A senha atual deixa de valer agora e as sessões abertas dela caem. A pessoa escolhe a nova senha no primeiro acesso.`,
    )) return null;
    const { temporaryPassword } = await resetPassword.mutateAsync(user.id);
    return temporaryPassword;
  };

  return {
    users,
    total,
    page,
    perPage: PER_PAGE,
    setPage,
    search,
    changeSearch,
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
    handleAlternarAtivo,
    handleGerarSenhaTemporaria,
  };
}
