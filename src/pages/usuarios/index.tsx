import { Users, Plus, Edit2, Trash2, Power, PowerOff } from 'lucide-react';
import UserFormModal from './components/UserFormModal';
import EstadoDaLista from '../components/EstadoDaLista';
import ListToolbar from '../components/ListToolbar';
import { useUsers } from './hooks/useUsers';
import type { User } from '../../domain/shared/user.types';
import { useAuthStore } from '../../domain/auth/auth.store';

const NOME_DO_CARGO: Record<User['role'], string> = {
  ADMIN: 'Administrador',
};

export default function UsersPage() {
  const {
    users, total, loading, erro, page, perPage, setPage, search, changeSearch,
    modalOpen, editing, openCreate, openEdit, closeModal, handleSubmit, handleDelete,
    handleAlternarAtivo,
  } = useUsers();
  // A própria conta não se desativa nem se exclui (W): o servidor recusa com
  // 409, e aqui os dois botões da linha dela ficam desligados, dizendo por quê.
  const meuId = useAuthStore((estado) => estado.usuario?.id);
  // A tela inteira é do Administrador — a rota passa pelo `SoAdmin` (App.tsx)
  // e o servidor exige `ADMIN` em toda rota dela —, então não há botão a
  // esconder aqui dentro.

  return (
    <div className="motion-safe:animate-fade-in">
      <div className="flex justify-between items-end mb-8">
        <div>
          <h2 className="text-xl font-mono text-text-primary uppercase tracking-widest">Usuários</h2>
          <p className="text-xs text-text-tertiary mt-2 font-mono">
            {total} {total === 1 ? 'usuário' : 'usuários'}
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-text-primary text-bg-base hover:bg-text-secondary font-mono text-xs uppercase tracking-widest transition-colors"
        >
          <Plus size={14} /> Novo Usuário
        </button>
      </div>

      <ListToolbar
        search={search}
        onSearchChange={changeSearch}
        placeholder="Buscar por nome ou e-mail..."
        page={page}
        perPage={perPage}
        total={total}
        onPageChange={setPage}
      />

      <div className="bg-surface-card border border-border-sutil overflow-x-auto">
        <table className="w-full text-left font-mono text-xs whitespace-nowrap">
          <thead className="bg-bg-base/50 text-text-secondary border-b border-border-sutil uppercase tracking-widest">
            <tr>
              <th className="px-6 py-4 font-normal">Nome</th>
              <th className="px-6 py-4 font-normal">E-mail</th>
              <th className="px-6 py-4 font-normal">Cargo</th>
              <th className="px-6 py-4 font-normal text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="text-text-primary">
            {users.map((user) => (
              <tr
                key={user.id}
                className={`border-b border-border-sutil/50 hover:bg-bg-base transition-colors group ${user.isActive ? '' : 'opacity-60'}`}
              >
                <td className="px-6 py-4 font-medium text-text-primary">
                  <div className="flex items-center gap-3">
                    {user.name}
                    {/* Sem esta marca, quem foi desativado pelo botão some de vista:
                        a linha continua igual às outras. "Desativado", e não
                        "inativo": é a mesma palavra do botão que a causou e a
                        mesma das seis abas de Configurações. */}
                    {!user.isActive && (
                      <span className="text-[10px] text-status-warning uppercase tracking-widest">desativado</span>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4 text-text-tertiary">{user.email}</td>
                <td className="px-6 py-4 text-text-secondary">{NOME_DO_CARGO[user.role]}</td>
                <td className="px-6 py-4 text-right">
                  {/* Visível ao passar o mouse, ao navegar por Tab e sempre no toque. */}
                  <div className="flex items-center justify-end gap-3 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 transition-opacity">
                    <button onClick={() => openEdit(user)} title="Editar" aria-label={`Editar ${user.name}`} className="text-text-tertiary hover:text-text-primary transition-colors">
                      <Edit2 size={14} />
                    </button>
                    <button
                      onClick={() => void handleAlternarAtivo(user)}
                      disabled={user.id === meuId}
                      title={user.id === meuId ? 'Você não pode desativar a si mesmo' : user.isActive ? 'Desativar' : 'Ativar'}
                      aria-label={`${user.isActive ? 'Desativar' : 'Ativar'} ${user.name}`}
                      className={`text-text-tertiary transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${user.id === meuId ? '' : 'hover:text-status-info'}`}
                    >
                      {user.isActive ? <PowerOff size={14} /> : <Power size={14} />}
                    </button>
                    <button
                      onClick={() => void handleDelete(user)}
                      disabled={user.id === meuId}
                      title={user.id === meuId ? 'Você não pode excluir a si mesmo' : 'Excluir'}
                      aria-label={`Excluir ${user.name}`}
                      className={`text-text-tertiary transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${user.id === meuId ? '' : 'hover:text-status-danger'}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={4} className="px-6 py-16 text-center text-text-tertiary">
                  <div className="flex flex-col items-center justify-center">
                    <Users size={24} className="mb-4 opacity-50" />
                    <EstadoDaLista carregando={loading} erro={erro}>
                      <span>
                        {search
                          ? `Nenhum usuário encontrado para "${search}".`
                          : 'Nenhum usuário cadastrado.'}
                      </span>
                      {/* Só na lista vazia de verdade: na busca sem resultado,
                          "cadastre o primeiro" não é verdade. */}
                      {!search && (
                        <button onClick={openCreate} className="mt-4 text-status-success hover:underline">
                          Cadastre o seu primeiro usuário
                        </button>
                      )}
                    </EstadoDaLista>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <UserFormModal
          user={editing}
          onClose={closeModal}
          onSubmit={handleSubmit}
        />
      )}
    </div>
  );
}
