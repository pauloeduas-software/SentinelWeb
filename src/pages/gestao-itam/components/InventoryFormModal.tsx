import { useState } from 'react';
import { X } from 'lucide-react';
import type { InventoryItem, Folder } from '../../../types';

interface InventoryFormModalProps {
  item?: InventoryItem | null;
  folders: Folder[];
  onClose: () => void;
  onSaved: () => void;
}

export default function InventoryFormModal({ item, folders, onClose, onSaved }: InventoryFormModalProps) {
  const [formData, setFormData] = useState({
    name: item?.name || '',
    description: item?.description || '',
    quantity: item?.quantity || 1,
    category: item?.category || '',
    status: item?.status || 'AVAILABLE',
    folderId: item?.folderId || '',
    notes: item?.notes || ''
  });
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const url = item ? `http://localhost:5000/api/inventory/${item.id}` : 'http://localhost:5000/api/inventory';
      const method = item ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Erro ao salvar');
      }

      onSaved();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-bg-base/80 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl bg-surface-card border border-border-sutil shadow-2xl overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-sutil bg-bg-base/50">
          <h2 className="text-sm font-mono text-text-primary tracking-widest uppercase">
            {item ? 'Editar Ativo' : 'Novo Ativo'}
          </h2>
          <button onClick={onClose} className="p-2 text-text-tertiary hover:text-text-primary transition-colors">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 font-mono text-xs overflow-y-auto max-h-[80vh]">
          {error && <div className="p-3 bg-status-danger/10 text-status-danger border border-status-danger/20 rounded">{error}</div>}
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-text-secondary uppercase tracking-widest text-[10px]">Nome do Item*</label>
              <input required type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full p-2 bg-bg-base border border-border-sutil text-text-primary focus:outline-none focus:border-text-secondary transition-colors" placeholder="Ex: Monitor Dell 27 polegadas" />
            </div>

            <div className="space-y-1">
              <label className="text-text-secondary uppercase tracking-widest text-[10px]">Categoria*</label>
              <input required type="text" value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})} className="w-full p-2 bg-bg-base border border-border-sutil text-text-primary focus:outline-none focus:border-text-secondary transition-colors" placeholder="Ex: Monitor, Licença, Teclado" />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-text-secondary uppercase tracking-widest text-[10px]">Descrição</label>
            <textarea value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} className="w-full p-2 bg-bg-base border border-border-sutil text-text-primary focus:outline-none focus:border-text-secondary transition-colors h-16 resize-none" placeholder="Detalhes técnicos, marca, modelo..." />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1">
              <label className="text-text-secondary uppercase tracking-widest text-[10px]">Quantidade*</label>
              <input required type="number" min="1" value={formData.quantity} onChange={e => setFormData({...formData, quantity: parseInt(e.target.value)})} className="w-full p-2 bg-bg-base border border-border-sutil text-text-primary focus:outline-none focus:border-text-secondary transition-colors" />
            </div>

            <div className="space-y-1">
              <label className="text-text-secondary uppercase tracking-widest text-[10px]">Pasta / Filial</label>
              <select value={formData.folderId} onChange={e => setFormData({...formData, folderId: e.target.value})} className="w-full p-2 bg-bg-base border border-border-sutil text-text-primary focus:outline-none focus:border-text-secondary transition-colors">
                <option value="">-- Nenhuma Pasta --</option>
                {folders.map(f => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-text-secondary uppercase tracking-widest text-[10px]">Status</label>
              <select value={formData.status} onChange={e => setFormData({...formData, status: e.target.value})} className="w-full p-2 bg-bg-base border border-border-sutil text-text-primary focus:outline-none focus:border-text-secondary transition-colors">
                <option value="AVAILABLE">Disponível</option>
                <option value="DEPLOYED">Em Uso (Deployed)</option>
                <option value="BROKEN">Danificado/Manutenção</option>
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-text-secondary uppercase tracking-widest text-[10px]">Notas da Modificação / Histórico</label>
            <textarea value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} className="w-full p-2 bg-bg-base border border-border-sutil text-text-primary focus:outline-none focus:border-text-secondary transition-colors h-16 resize-none" placeholder="Ex: Entregue dia 15/05, com defeito na tela, etc." />
          </div>

          <div className="pt-4 flex justify-end gap-3 border-t border-border-sutil">
            <button type="button" onClick={onClose} className="px-4 py-2 border border-border-sutil text-text-secondary hover:text-text-primary hover:bg-bg-base transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={loading} className="px-4 py-2 bg-text-primary text-bg-base hover:bg-text-secondary transition-colors disabled:opacity-50">
              {loading ? 'Salvando...' : 'Salvar Ativo'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
