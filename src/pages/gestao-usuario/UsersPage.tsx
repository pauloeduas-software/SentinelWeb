import { useEffect, useState } from 'react';
import axios from 'axios';
import { Users, Plus, Edit2, Trash2 } from 'lucide-react';
import type { User } from '../../types';
import UserFormModal from './components/UserFormModal';

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);

  const fetchUsers = async () => {
    try {
      const res = await axios.get('http://localhost:5000/api/users');
      setUsers(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm("Tem certeza que deseja remover este usuário?")) return;
    try {
      await axios.delete(`http://localhost:5000/api/users/${id}`);
      fetchUsers();
    } catch (err) {
      alert("Erro ao deletar usuário.");
    }
  };

  const handleEdit = (user: User) => {
    setEditingUser(user);
    setIsModalOpen(true);
  };

  return (
    <div className="animate-in fade-in duration-300">
      <div className="flex justify-between items-end mb-8">
        <div>
          <h2 className="text-xl font-mono text-text-primary uppercase tracking-widest">Gestão de Usuários</h2>
          <p className="text-xs text-text-tertiary mt-2 font-mono">Colaboradores da empresa</p>
        </div>
        <button 
          onClick={() => { setEditingUser(null); setIsModalOpen(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-text-primary text-bg-base hover:bg-text-secondary font-mono text-xs uppercase tracking-widest transition-colors"
        >
          <Plus size={14} /> Novo Usuário
        </button>
      </div>

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
                <td className="px-6 py-4 font-medium text-text-primary">{user.name}</td>
                <td className="px-6 py-4 text-text-tertiary">{user.email}</td>
                <td className="px-6 py-4">{user.department || '--'}</td>
                <td className="px-6 py-4 text-right">
                  <div className="flex items-center justify-end gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => handleEdit(user)} className="text-text-tertiary hover:text-text-primary transition-colors">
                      <Edit2 size={14} />
                    </button>
                    <button onClick={() => handleDelete(user.id)} className="text-text-tertiary hover:text-status-danger transition-colors">
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
                    <span>Nenhum usuário cadastrado.</span>
                    <button onClick={() => { setEditingUser(null); setIsModalOpen(true); }} className="mt-4 text-status-success hover:underline">
                      Cadastre o seu primeiro usuário
                    </button>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <UserFormModal 
          user={editingUser}
          onClose={() => setIsModalOpen(false)}
          onSaved={() => {
            setIsModalOpen(false);
            fetchUsers();
          }}
        />
      )}
    </div>
  );
}
