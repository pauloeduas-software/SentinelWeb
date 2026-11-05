import { KeyRound, Pencil, Plus, Power, PowerOff, Trash2, Users } from 'lucide-react';
import UserFormModal from './components/UserFormModal';
import AcoesDaLinha from '../../components/AcoesDaLinha';
import EstadoDaLista from '../../components/EstadoDaLista';
import ListToolbar from '../../components/ListToolbar';
import PaginaCabecalho from '../../components/PaginaCabecalho';
import { Avatar } from '../../components/ui/avatar';
import { Badge, PontoDeStatus } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { useUsers } from './hooks/useUsers';
import { nomeDoCargo } from '../../helpers/cargo.helper';
import { useAuthStore } from '../../stores/auth.store';

export default function UsersPage() {
  const {
    users, total, loading, erro, page, perPage, setPage, search, changeSearch,
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

      <PaginaCabecalho
        titulo="Usuários"
        subtitulo={`${total} ${total === 1 ? 'usuário' : 'usuários'}`}
        acao={<Button onClick={openCreate}><Plus /> Novo usuário</Button>}
      />

      <ListToolbar
        search={search}
        onSearchChange={changeSearch}
        placeholder="Buscar por nome ou e-mail..."
        page={page}
        perPage={perPage}
        total={total}
        onPageChange={setPage}
      />

      {users.length === 0 ? (
        <Card className="flex flex-col items-center justify-center gap-3 py-16 text-sm text-text-tertiary">
          <Users className="size-6 opacity-50" />
          <EstadoDaLista carregando={loading} erro={erro}>
            <span>
              {search
                ? `Nenhum usuário encontrado para "${search}".`
                : 'Nenhum usuário cadastrado.'}
            </span>
            {/* Só na lista vazia de verdade: na busca sem resultado,
                "cadastre o primeiro" não é verdade. */}
            {!search && (
              <Button variant="link" onClick={openCreate}>Cadastre o seu primeiro usuário</Button>
            )}
          </EstadoDaLista>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Usuário</TableHead>
                <TableHead>Cargo</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead className="w-12 text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => {
                const propria = user.id === meuId;

                return (
                  <TableRow
                    key={user.id}
                    onClick={() => openEdit(user)}
                    className={user.isActive ? 'cursor-pointer' : 'cursor-pointer opacity-60'}
                  >
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar nome={user.name} />
                        <div className="min-w-0">
                          {/* O botão é o caminho do teclado: o clique sobe para a linha. */}
                          <button type="button" className="block max-w-full truncate text-left font-medium text-text-primary focus-visible:underline focus-visible:outline-none">
                            {user.name}
                          </button>
                          <div className="truncate text-xs text-text-tertiary">{user.email}</div>
                        </div>
                      </div>
                    </TableCell>

                    {/* Neutro para todo cargo: cargo é nome, e nome não ganha cor. */}
                    <TableCell><Badge>{nomeDoCargo(user.role)}</Badge></TableCell>

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
        </Card>
      )}

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
