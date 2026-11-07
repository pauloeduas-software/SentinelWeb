import { useMemo, useState } from 'react';
import {
  useCreateUser,
  useDeleteUser,
  useResetUserPassword,
  useUpdateUser,
  useUserStatsQuery,
  useUsersQuery,
  type UserInput,
} from '../../../queries/user.queries';
import type { User } from '../../../types/user.types';
import { ativoDoStatus, contagensDoStatusAtivo, statusAtivoDaUrl, type StatusAtivo } from '../../../helpers/status.helper';
import { confirmar } from '../../../hooks/useConfirmacao';
import { useListaNaUrl, usePaginaQueExiste } from '../../../hooks/useListaNaUrl';
import { useNotificacao } from '../../../hooks/useNotificacao';
import { useAuthStore } from '../../../stores/auth.store';

export function useUsers() {
  const notificar = useNotificacao();
  const meuId = useAuthStore((estado) => estado.usuario?.id);
  const conferirSessao = useAuthStore((estado) => estado.conferirSessao);
  const { page, perPage, setPage, search, debouncedSearch, changeSearch, parametros, filtrar } = useListaNaUrl();
  const status = statusAtivoDaUrl(parametros.get('status'));

  const params = useMemo(
    () => ({ page, perPage, q: debouncedSearch || undefined, isActive: ativoDoStatus(status) }),
    [page, perPage, debouncedSearch, status],
  );

  // A busca e a invalidação depois de gravar são da query
  // (queries/user.queries.ts). Aqui fica só estado de tela.
  const { data, isPending, error } = useUsersQuery(params);
  const { data: stats } = useUserStatsQuery();
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const deleteUser = useDeleteUser();
  const resetPassword = useResetUserPassword();

  const users = data?.rows ?? [];
  const total = data?.total ?? 0;
  usePaginaQueExiste(page, data?.total, setPage);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  // A senha gerada pelo `⋯` da linha, que o formulário abre mostrando. Fechar a
  // janela a apaga: ela aparece uma vez só, como a gerada por dentro dele.
  const [senhaGerada, setSenhaGerada] = useState<string | null>(null);

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
    setSenhaGerada(null);
  };

  // O erro sobe para o formulário mostrar a mensagem do servidor. O CADASTRO
  // não fecha a janela: devolve a senha temporária da conta nova (AU), que o
  // formulário mostra uma vez; quem fecha é o administrador, depois de copiá-la.
  const handleSubmit = async (data: UserInput): Promise<string | null> => {
    if (!editing) return (await createUser.mutateAsync(data)).temporaryPassword;
    await updateUser.mutateAsync({ id: editing.id, data });
    // A PRÓPRIA conta com outro cargo (AV): o servidor já relê o cargo a cada
    // requisição, mas o menu e o `usePode` leem a sessão guardada. Sem reler,
    // quem deixou de ser Administrador continuaria vendo Usuários, e a lista
    // voltaria 403.
    if (editing.id === meuId && data.role !== editing.role) await conferirSessao();
    closeModal();
    notificar.sucesso('Usuário salvo.');
    return null;
  };

  // EXCLUIR, e a pergunta diz o que isso quer dizer AQUI: não tem volta — errou,
  // cadastra de novo. É o terceiro do trio Editar/Desativar/Excluir — e o texto
  // precisa separá-lo do Desativar, que é o que se usa para quem saiu da
  // empresa. "Tem certeza que deseja remover?" não dizia nem quem nem o quê.
  const handleDelete = async (user: User) => {
    if (!(await confirmar({
      titulo: `Excluir "${user.name}"?`,
      descricao: 'Esta ação não tem lixeira.',
      acao: 'Excluir',
      perigo: true,
    }))) return;
    try {
      await deleteUser.mutateAsync(user.id);
      notificar.sucesso('Usuário excluído.');
    } catch (error) {
      notificar.erro((error as Error).message);
    }
  };

  // DESATIVAR É UM BOTÃO DA LINHA, não uma caixa no formulário — o padrão das
  // listas do sistema (Configurações e Colaboradores também). Desativar não
  // apaga: a conta fica na lista, só não entra mais. A confirmação é só na ida;
  // reativar não tem o que perder.
  const handleAlternarAtivo = async (user: User) => {
    if (user.isActive && !(await confirmar({
      titulo: `Desativar "${user.name}"?`,
      descricao: 'A conta continua na lista, mas não entra mais no sistema.',
      acao: 'Desativar',
    }))) return;

    try {
      await updateUser.mutateAsync({ id: user.id, data: { isActive: !user.isActive } });
      notificar.sucesso(user.isActive ? 'Usuário desativado.' : 'Usuário ativado.');
    } catch (error) {
      notificar.erro((error as Error).message);
    }
  };

  // A SENHA TEMPORÁRIA (AR): de quem esqueceu a sua. Gerar invalida a senha de hoje
  // e derruba as sessões abertas da conta NA HORA, então a pergunta diz isso. A
  // senha volta uma vez só, para o formulário mostrar; o erro sobe para ele.
  const handleGerarSenhaTemporaria = async (user: User): Promise<string | null> => {
    if (!(await confirmar({
      titulo: `Gerar uma senha temporária para "${user.name}"?`,
      descricao: 'A senha atual deixa de valer agora e as sessões abertas dela caem. A pessoa escolhe a nova senha no primeiro acesso.',
      acao: 'Gerar senha',
    }))) return null;
    const { temporaryPassword } = await resetPassword.mutateAsync(user.id);
    return temporaryPassword;
  };

  // A MESMA GERAÇÃO, pelo `⋯` da linha: a senha só existe nesta resposta, então
  // ela precisa de onde aparecer, e o lugar é o mesmo formulário de quem gera por
  // dentro dele. Sem formulário aberto, o erro vai para o aviso, como nas outras
  // ações da linha.
  const handleGerarSenhaDaLinha = async (user: User) => {
    try {
      const senha = await handleGerarSenhaTemporaria(user);
      if (!senha) return;
      setSenhaGerada(senha);
      openEdit(user);
    } catch (error) {
      notificar.erro((error as Error).message);
    }
  };

  return {
    users,
    total,
    page,
    perPage,
    setPage,
    search,
    buscaFeita: debouncedSearch,
    changeSearch,
    status,
    // Clicar liga o recorte, clicar de novo desliga, e o Total limpa.
    escolherStatus: (proximo: StatusAtivo | undefined) => filtrar('status', proximo === status ? undefined : proximo),
    contagens: contagensDoStatusAtivo(stats),
    loading: isPending,
    // Para a tabela não dizer "nenhum usuário cadastrado" quando a consulta
    // falhou — e oferecer cadastrar o primeiro (`EstadoDaLista`).
    erro: error ? error.message : null,
    modalOpen,
    editing,
    senhaGerada,
    openCreate,
    openEdit,
    closeModal,
    handleSubmit,
    handleDelete,
    handleAlternarAtivo,
    handleGerarSenhaTemporaria,
    handleGerarSenhaDaLinha,
  };
}
