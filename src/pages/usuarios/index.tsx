import { KeyRound, Pencil, Plus, Power, PowerOff, Trash2, Users } from 'lucide-react';
import UserFormModal from './components/UserFormModal';
import AcoesDaLinha from '../../components/AcoesDaLinha';
import CartoesDeContagem from '../../components/CartoesDeContagem';
import ListaVazia from '../../components/ListaVazia';
import ListToolbar from '../../components/ListToolbar';
import PaginaCabecalho from '../../components/PaginaCabecalho';
import PessoaNaLinha from '../../components/PessoaNaLinha';
import { Badge, PontoDeStatus } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeadAcoes, TableHeader, TableRow } from '../../components/ui/table';
import { useUsers } from './hooks/useUsers';
import { nomeDoCargo } from '../../helpers/cargo.helper';
import { useAuthStore } from '../../stores/auth.store';

export default function UsersPage() {
  const {
    users, total, loading, erro, page, perPage, setPage, search, buscaFeita, changeSearch,
    status, escolherStatus, contagens,
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

      <CartoesDeContagem contagens={contagens} escolhido={status} onEscolher={escolherStatus} />

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
              <TableHead className="w-36">Status</TableHead>
              <TableHeadAcoes />
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => {
              const propria = user.id === meuId;

              return (
                <TableRow key={user.id} onClick={() => openEdit(user)} apagada={!user.isActive}>
                  <TableCell>
                    <PessoaNaLinha
                      nome={user.name}
                      email={user.email}
                      // Quem ainda não escolheu a sua senha (CB). Não é status: a conta está
                      // ativa, e no desativado o aviso some, porque ele não entra mesmo.
                      selo={user.isActive && user.mustChangePassword && (
                        <Badge tom="aviso" className="shrink-0">Senha temporária</Badge>
                      )}
                    />
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
                        // A própria senha se troca em Minha conta (AR), e a conta desativada
                        // não entra: a temporária não serviria para nada.
                        !propria && user.isActive && {
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
          <ListaVazia
            icone={Users}
            carregando={loading}
            erro={erro}
            nome="usuário"
            busca={buscaFeita}
            filtrada={Boolean(status)}
            onCadastrar={openCreate}
          />
        )}
      </Card>

      {modalOpen && (
        <UserFormModal
          user={editing}
          senhaGerada={senhaGerada}
          onClose={closeModal}
          onSubmit={handleSubmit}
          onGerarSenhaTemporaria={editing && editing.id !== meuId && editing.isActive ? () => handleGerarSenhaTemporaria(editing) : undefined}
        />
      )}
    </div>
  );
}
