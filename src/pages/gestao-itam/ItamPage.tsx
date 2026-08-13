import { useEffect, useState } from 'react';
import axios from 'axios';
import { Database, Plus, Edit2, Trash2, Folder as FolderIcon, Building } from 'lucide-react';
import type { InventoryItem, Folder } from '../../types';
import InventoryFormModal from './components/InventoryFormModal';

export default function ItamPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  
  const [newFolderName, setNewFolderName] = useState('');
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);

  const fetchData = async () => {
    try {
      const [invRes, foldRes] = await Promise.all([
        axios.get('http://localhost:5000/api/inventory'),
        axios.get('http://localhost:5000/api/folders')
      ]);
      setItems(invRes.data);
      setFolders(foldRes.data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    try {
      await axios.post('http://localhost:5000/api/folders', { name: newFolderName });
      setNewFolderName('');
      setIsCreatingFolder(false);
      fetchData();
    } catch (err: any) {
      alert(err.response?.data?.error || "Erro ao criar pasta");
    }
  };

  const handleDeleteItem = async (id: string) => {
    if (!confirm("Tem certeza que deseja remover este item?")) return;
    try {
      await axios.delete(`http://localhost:5000/api/inventory/${id}`);
      fetchData();
    } catch (err) {
      alert("Erro ao deletar item.");
    }
  };

  const handleDeleteFolder = async (id: string) => {
    if (!confirm("Tem certeza que deseja remover esta pasta? Os itens não serão excluídos, apenas perderão a pasta.")) return;
    try {
      await axios.delete(`http://localhost:5000/api/folders/${id}`);
      if (selectedFolderId === id) setSelectedFolderId(null);
      fetchData();
    } catch (err) {
      alert("Erro ao deletar pasta.");
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'AVAILABLE': return 'text-status-success bg-status-success/10 border-status-success/20';
      case 'DEPLOYED': return 'text-status-info bg-status-info/10 border-status-info/20';
      case 'BROKEN': return 'text-status-danger bg-status-danger/10 border-status-danger/20';
      default: return 'text-text-tertiary bg-surface-card border-border-sutil';
    }
  };

  // Filter items by folder
  const filteredItems = selectedFolderId 
    ? items.filter(i => i.folderId === selectedFolderId)
    : items;

  return (
    <div className="animate-in fade-in duration-300 h-[calc(100vh-4rem)] flex gap-6 pb-6">
      
      {/* Sidebar de Pastas */}
      <div className="w-64 bg-surface-card border border-border-sutil flex flex-col h-full shrink-0">
        <div className="p-4 border-b border-border-sutil">
          <h3 className="text-xs font-mono text-text-secondary uppercase tracking-widest mb-4">Pastas / Filiais</h3>
          
          {isCreatingFolder ? (
            <form onSubmit={handleCreateFolder} className="flex gap-2">
              <input 
                type="text" autoFocus
                value={newFolderName} onChange={e => setNewFolderName(e.target.value)}
                placeholder="Nome da pasta..."
                className="w-full p-1.5 text-xs bg-bg-base border border-border-sutil text-text-primary focus:outline-none"
              />
              <button type="submit" className="px-2 bg-text-primary text-bg-base text-xs hover:bg-text-secondary">+</button>
              <button type="button" onClick={() => setIsCreatingFolder(false)} className="px-2 text-text-tertiary hover:text-text-primary text-xs">x</button>
            </form>
          ) : (
            <button 
              onClick={() => setIsCreatingFolder(true)}
              className="w-full flex items-center justify-center gap-2 py-2 border border-dashed border-border-sutil text-text-tertiary hover:text-text-primary hover:border-text-secondary transition-all text-xs font-mono uppercase"
            >
              <Plus size={12} /> Nova Pasta
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1 font-mono text-xs">
          <button
            onClick={() => setSelectedFolderId(null)}
            className={`w-full flex items-center gap-2 px-3 py-2 transition-colors text-left ${selectedFolderId === null ? 'bg-bg-base text-text-primary border-l-2 border-text-primary' : 'text-text-secondary hover:bg-bg-base/50'}`}
          >
            <Building size={14} /> 
            <span className="flex-1 truncate">Ver Todos</span>
            <span className="text-[10px] text-text-tertiary">{items.length}</span>
          </button>
          
          {folders.map(folder => {
            const count = items.filter(i => i.folderId === folder.id).length;
            return (
              <div key={folder.id} className="group flex items-center relative">
                <button
                  onClick={() => setSelectedFolderId(folder.id)}
                  className={`flex-1 flex items-center gap-2 px-3 py-2 transition-colors text-left ${selectedFolderId === folder.id ? 'bg-bg-base text-text-primary border-l-2 border-text-primary' : 'text-text-secondary hover:bg-bg-base/50'}`}
                >
                  <FolderIcon size={14} /> 
                  <span className="flex-1 truncate">{folder.name}</span>
                  <span className="text-[10px] text-text-tertiary">{count}</span>
                </button>
                <button 
                  onClick={() => handleDeleteFolder(folder.id)}
                  className="absolute right-2 opacity-0 group-hover:opacity-100 p-1 text-text-tertiary hover:text-status-danger transition-colors bg-surface-card"
                  title="Deletar pasta"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Conteúdo Principal (Tabela) */}
      <div className="flex-1 flex flex-col overflow-hidden h-full">
        <div className="flex justify-between items-end mb-6 shrink-0">
          <div>
            <h2 className="text-xl font-mono text-text-primary uppercase tracking-widest">Inventário</h2>
            <p className="text-xs text-text-tertiary mt-2 font-mono">
              {selectedFolderId ? `Pasta: ${folders.find(f => f.id === selectedFolderId)?.name}` : 'Todos os Ativos da Empresa'}
            </p>
          </div>
          <button 
            onClick={() => { setEditingItem(null); setIsModalOpen(true); }}
            className="flex items-center gap-2 px-4 py-2 bg-text-primary text-bg-base hover:bg-text-secondary font-mono text-xs uppercase tracking-widest transition-colors"
          >
            <Plus size={14} /> Novo Ativo
          </button>
        </div>

        <div className="bg-surface-card border border-border-sutil flex-1 overflow-auto">
          <table className="w-full text-left font-mono text-xs whitespace-nowrap">
            <thead className="bg-bg-base/50 text-text-secondary border-b border-border-sutil uppercase tracking-widest sticky top-0 z-10">
              <tr>
                <th className="px-6 py-4 font-normal">Nome / Descrição</th>
                <th className="px-6 py-4 font-normal">Categoria</th>
                <th className="px-6 py-4 font-normal">Qtd</th>
                <th className="px-6 py-4 font-normal">Status</th>
                <th className="px-6 py-4 font-normal text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="text-text-primary divide-y divide-border-sutil/50">
              {filteredItems.map((item) => (
                <tr key={item.id} className="hover:bg-bg-base transition-colors group">
                  <td className="px-6 py-4">
                    <div className="font-medium">{item.name}</div>
                    {item.description && <div className="text-[10px] text-text-tertiary mt-1 max-w-[200px] truncate">{item.description}</div>}
                  </td>
                  <td className="px-6 py-4 text-text-tertiary">{item.category}</td>
                  <td className="px-6 py-4 text-text-secondary">{item.quantity}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 border rounded-[2px] text-[10px] uppercase tracking-widest ${getStatusColor(item.status)}`}>
                      {item.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => { setEditingItem(item); setIsModalOpen(true); }} className="text-text-tertiary hover:text-text-primary transition-colors">
                        <Edit2 size={14} />
                      </button>
                      <button onClick={() => handleDeleteItem(item.id)} className="text-text-tertiary hover:text-status-danger transition-colors">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredItems.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-16 text-center text-text-tertiary">
                    <div className="flex flex-col items-center justify-center">
                      <Database size={24} className="mb-4 opacity-50" />
                      <span>Nenhum ativo corporativo nesta pasta.</span>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <InventoryFormModal 
          item={editingItem}
          folders={folders}
          onClose={() => setIsModalOpen(false)}
          onSaved={() => {
            setIsModalOpen(false);
            fetchData();
          }}
        />
      )}
    </div>
  );
}
