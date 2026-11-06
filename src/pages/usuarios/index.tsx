import { KeyRound, Pencil, Plus, Power, PowerOff, Trash2, Users } from 'lucide-react';
import UserFormModal from './components/UserFormModal';
import AcoesDaLinha from '../../components/AcoesDaLinha';
import ListaVazia from '../../components/ListaVazia';
import ListToolbar from '../../components/ListToolbar';
import PaginaCabecalho from '../../components/PaginaCabecalho';
import { Avatar } from '../../components/ui/avatar';
import { PontoDeStatus } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeadAcoes, TableHeader, TableNome, TableRow, TableSublinha } from '../../components/ui/table';
import { useUsers } from './hooks/useUsers';
import { nomeDoCargo } from '../../helpers/cargo.helper';
import { useAuthStore } from '../../stores/auth.store';

export default function UsersPage() {
  const {
    users, total, loading, erro, page, perPage, setPage, search, buscaFeita, changeSearch,
    modalOpen, editing, senhaGerada, openCreate, openEdit, closeModal, handleSubmit, handleDelete,
    handleAlternarAtivo, handleGerarSenhaTemporaria, handleGerarSenhaDaLinha,
  } = useUsers();
  // A própria conta não se desativa nem se exclui (W): o servidor recusa com
  // 409, e aqui as duas ações da linha dela ficam desligadas, dizendo por quê.
  const meuId = useAuthStore((estado) => estado.usuario?.id);
  // A tela inteira é do Administrador — a rota passa pelo `SoCargo` (App.tsx)
  // e o servidor exige `ADMIN` em toda rota dela —, então não há botão a
  // esconder aqui dentro.

  return (
    <div className="motion-safe:animate-fade-in flex flex-col pb-6">

      <PaginaCabecalho titulo="Usuários" />

      <ListToolbar
        search={search}
        onSearchChange={changeSearch}
        placeholder="Buscar por nome ou e-mail…"
        acao={<Button onClick={openCreate}><Plus /> Novo usuário</Button>}
        page={page}
        perPage={perPage}
        total={total}
        onPageChange={setPage}
      />

      <Card className="overflow-hidden">
        <Table className="min-w-[44rem]">
          <TableHeader>
            <TableRow>
              <TableHead>Usuário</TableHead>
              <TableHead className="w-[20%]">Cargo</TableHead>
              <TableHead className="w-36">Situação</TableHead>
              <TableHeadAcoes />
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => {
              const propria = user.id === meuId;

              return (
                <TableRow key={user.id} onClick={() => openEdit(user)} apagada={!user.isActive}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar nome={user.name} />
                      <div className="min-w-0">
                        <TableNome>{user.name}</TableNome>
                        <TableSublinha>{user.email}</TableSublinha>
                      </div>
                    </div>
                  </TableCell>

                  <TableCell>{nomeDoCargo(user.role)}</TableCell>

                  <TableCell>
                    {/* Sem esta marca, quem foi desativado pelo botão some de vista:
                        a linha continua igual às outras. "Desativado", e não
                        "inativo": é a mesma palavra do botão que a causou e a
                        mesma de Configurações e de Colaboradores. */}
                    <PontoDeStatus tom={user.isActive ? 'sucesso' : 'aviso'}>
                      {user.isActive ? 'Ativo' : 'Desativado'}
                    </PontoDeStatus>
                  </TableCell>

                  <TableCell>
                    <AcoesDaLinha
                      nome={user.name}
                      acoes={[
                        { rotulo: 'Editar', icone: Pencil, onClick: () => openEdit(user) },
                        // A própria senha se troca em Minha conta (AR).
                        !propria && {
                          rotulo: 'Gerar senha temporária',
                          icone: KeyRound,
                          onClick: () => void handleGerarSenhaDaLinha(user),
                        },
                        {
                          rotulo: user.isActive ? 'Desativar' : 'Ativar',
                          icone: user.isActive ? PowerOff : Power,
                          onClick: () => void handleAlternarAtivo(user),
                          disabled: propria,
                          titulo: propria ? 'Você não pode desativar a si mesmo' : undefined,
                        },
                        {
                          rotulo: 'Excluir',
                          icone: Trash2,
                          onClick: () => void handleDelete(user),
                          disabled: propria,
                          titulo: propria ? 'Você não pode excluir a si mesmo' : undefined,
                          perigo: true,
                        },
                      ]}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        {users.length === 0 && (
          <ListaVazia icone={Users} carregando={loading} erro={erro} nome="usuário" busca={buscaFeita} onCadastrar={openCreate} />
        )}
      </Card>

      {modalOpen && (
        <UserFormModal
          user={editing}
          senhaGerada={senhaGerada}
          onClose={closeModal}
          onSubmit={handleSubmit}
          onGerarSenhaTemporaria={editing && editing.id !== meuId ? () => handleGerarSenhaTemporaria(editing) : undefined}
        />
      )}
    </div>
  );
}
