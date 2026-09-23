import { Users, Plus, Edit2, Trash2, RotateCcw } from 'lucide-react';
import { Link } from 'react-router-dom';
import UserFormModal from './components/UserFormModal';
import ListToolbar from '../components/ListToolbar';
import { useUsers } from './hooks/useUsers';

export default function UsersPage() {
  const {
    users, total, page, perPage, setPage, search, changeSearch, view, changeView,
    modalOpen, editing, openCreate, openEdit, closeModal, handleSubmit, handleDelete, handleRestore,
  } = useUsers();

  return (
    <div className="animate-in fade-in duration-300">
      <div className="flex justify-between items-end mb-8">
        <div>
          <h2 className="text-xl font-mono text-text-primary uppercase tracking-widest">Gestão de Usuários</h2>
          <p className="text-xs text-text-tertiary mt-2 font-mono">
            {total} {total === 1 ? 'colaborador' : 'colaboradores'}
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
        view={view}
        onViewChange={changeView}
        search={search}
        onSearchChange={changeSearch}
        placeholder="Buscar por nome, e-mail ou departamento..."
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
              <th className="px-6 py-4 font-normal">Departamento</th>
              <th className="px-6 py-4 font-normal text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="text-text-primary">
            {users.map((user) => (
              <tr key={user.id} className="border-b border-border-sutil/50 hover:bg-bg-base transition-colors group">
                {/* O nome é o caminho para o PERFIL: é lá que estão os dois
                    baldes de posse e o desligamento. A lista não tem como
                    mostrar isso em uma célula — são três listas. */}
                <td className="px-6 py-4 font-medium text-text-primary">
                  <Link to={`/users/${user.id}`} className="hover:underline">{user.name}</Link>
                </td>
                <td className="px-6 py-4 text-text-tertiary">{user.email}</td>
                <td className="px-6 py-4">{user.department || '--'}</td>
                <td className="px-6 py-4 text-right">
                  <div className="flex items-center justify-end gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                    {view === 'trashed' ? (
                      <button onClick={() => void handleRestore(user.id)} title="Restaurar" className="text-text-tertiary hover:text-status-success transition-colors">
                        <RotateCcw size={14} />
                      </button>
                    ) : (
                      <>
                        <button onClick={() => openEdit(user)} title="Editar" className="text-text-tertiary hover:text-text-primary transition-colors">
                          <Edit2 size={14} />
                        </button>
                        <button onClick={() => void handleDelete(user.id)} title="Mover para a lixeira" className="text-text-tertiary hover:text-status-danger transition-colors">
                          <Trash2 size={14} />
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={4} className="px-6 py-16 text-center text-text-tertiary">
                  <div className="flex flex-col items-center justify-center">
                    <Users size={24} className="mb-4 opacity-50" />
                    <span>
                      {view === 'trashed'
                        ? 'A lixeira está vazia.'
                        : search
                          ? `Nenhum usuário encontrado para "${search}".`
                          : 'Nenhum usuário cadastrado.'}
                    </span>
                    <button onClick={openCreate} className="mt-4 text-status-success hover:underline">
                      Cadastre o seu primeiro usuário
                    </button>
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
