import { Users, Plus, Edit2, Trash2, RotateCcw, UserCheck, UserX } from 'lucide-react';
import { Link } from 'react-router-dom';
import UserFormModal from './components/UserFormModal';
import EstadoDaLista from '../components/EstadoDaLista';
import ListToolbar from '../components/ListToolbar';
import { useUsers } from './hooks/useUsers';
import Iniciais from '../components/Iniciais';
import { usePode } from '../../domain/auth/auth.store';

export default function UsersPage() {
  const {
    users, total, loading, erro, page, perPage, setPage, search, changeSearch, view, changeView,
    modalOpen, editing, openCreate, openEdit, closeModal, handleSubmit, handleDelete, handleRestore,
    handleAlternarAtivo,
  } = useUsers();
  // Escrever em colaborador é `ADMIN` no servidor; o técnico LÊ esta tela. Sem
  // isto ele via Editar, Desativar e Excluir que só levavam 403.
  const podeEscrever = usePode('ADMIN');

  return (
    <div className="animate-in fade-in duration-300">
      <div className="flex justify-between items-end mb-8">
        <div>
          <h2 className="text-xl font-mono text-text-primary uppercase tracking-widest">Usuários</h2>
          <p className="text-xs text-text-tertiary mt-2 font-mono">
            {total} {total === 1 ? 'colaborador' : 'colaboradores'}
          </p>
        </div>
        {podeEscrever && (
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 bg-text-primary text-bg-base hover:bg-text-secondary font-mono text-xs uppercase tracking-widest transition-colors"
          >
            <Plus size={14} /> Novo Usuário
          </button>
        )}
      </div>

      <ListToolbar
        view={view}
        onViewChange={changeView}
        search={search}
        onSearchChange={changeSearch}
        placeholder="Buscar por nome, e-mail ou matrícula..."
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
              <th className="px-6 py-4 font-normal text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="text-text-primary">
            {users.map((user) => (
              <tr
                key={user.id}
                className={`border-b border-border-sutil/50 hover:bg-bg-base transition-colors group ${user.isActive ? '' : 'opacity-60'}`}
              >
                {/* O nome é o caminho para o PERFIL: é lá que estão os postos
                    que a pessoa ocupa e o histórico dela. */}
                <td className="px-6 py-4 font-medium text-text-primary">
                  {/* AS INICIAIS (F11): a cor vem do nome, então a mesma pessoa é
                      sempre a mesma cor — é o que deixa achar uma linha conhecida
                      numa lista de cem sem ler nome por nome. Decoração, nunca o
                      único portador de significado: o nome está do lado. */}
                  <div className="flex items-center gap-3">
                    <Link to={`/users/${user.id}`} className="flex items-center gap-2 hover:underline">
                      <Iniciais nome={user.name} />
                      {user.name}
                    </Link>
                    {/* Sem esta marca, quem foi desativado pelo botão some de vista:
                        a linha continua igual às outras. "Desativado", e não
                        "inativo": é a mesma palavra do botão que a causou e a
                        mesma das cinco abas de Configurações. */}
                    {!user.isActive && (
                      <span className="text-[10px] text-status-warning uppercase tracking-widest">desativado</span>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4 text-text-tertiary">{user.email}</td>
                <td className="px-6 py-4 text-right">
                  {/* Visível ao passar o mouse, ao navegar por Tab e sempre no toque. */}
                  {podeEscrever && (
                    <div className="flex items-center justify-end gap-3 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 transition-opacity">
                      {view === 'trashed' ? (
                        <button onClick={() => void handleRestore(user.id)} title="Restaurar" aria-label={`Restaurar ${user.name}`} className="text-text-tertiary hover:text-status-success transition-colors">
                          <RotateCcw size={14} />
                        </button>
                      ) : (
                        <>
                          <button onClick={() => openEdit(user)} title="Editar" aria-label={`Editar ${user.name}`} className="text-text-tertiary hover:text-text-primary transition-colors">
                            <Edit2 size={14} />
                          </button>
                          <button
                            onClick={() => void handleAlternarAtivo(user)}
                            title={user.isActive ? 'Desativar' : 'Ativar'}
                            aria-label={`${user.isActive ? 'Desativar' : 'Ativar'} ${user.name}`}
                            className={`text-text-tertiary transition-colors ${user.isActive ? 'hover:text-status-warning' : 'hover:text-status-success'}`}
                          >
                            {user.isActive ? <UserX size={14} /> : <UserCheck size={14} />}
                          </button>
                          <button onClick={() => void handleDelete(user)} title="Excluir" aria-label={`Excluir ${user.name}`} className="text-text-tertiary hover:text-status-danger transition-colors">
                            <Trash2 size={14} />
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={3} className="px-6 py-16 text-center text-text-tertiary">
                  <div className="flex flex-col items-center justify-center">
                    <Users size={24} className="mb-4 opacity-50" />
                    <EstadoDaLista carregando={loading} erro={erro}>
                      <span>
                        {view === 'trashed'
                          ? 'A lixeira está vazia.'
                          : search
                            ? `Nenhum usuário encontrado para "${search}".`
                            : 'Nenhum usuário cadastrado.'}
                      </span>
                      {/* Só na lista vazia de verdade: na lixeira e na busca sem
                          resultado, "cadastre o primeiro" não é verdade. */}
                      {podeEscrever && view !== 'trashed' && !search && (
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
