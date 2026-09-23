import { Database, Plus, Edit2, Trash2, RotateCcw } from 'lucide-react';
import InventoryFormModal from './components/InventoryFormModal';
import ListToolbar from '../components/ListToolbar';
import { useInventory } from './hooks/useInventory';
import { statusColor } from './helpers/status-label.helper';

export default function ItamPage() {
  const {
    items, total, totalCadastrado, page, perPage, setPage, search, changeSearch, view, changeView,
    modalOpen, editing, openCreate, openEdit, closeModal, handleSubmit, handleDelete, handleRestore,
  } = useInventory();

  return (
    <div className="animate-in fade-in duration-300 h-[calc(100vh-4rem)] flex flex-col pb-6">

      <div className="flex justify-between items-end mb-6 shrink-0">
        <div>
          <h2 className="text-xl font-mono text-text-primary uppercase tracking-widest">Inventário</h2>
          <p className="text-xs text-text-tertiary mt-2 font-mono">
            {totalCadastrado} {totalCadastrado === 1 ? 'ativo cadastrado' : 'ativos cadastrados'}
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-text-primary text-bg-base hover:bg-text-secondary font-mono text-xs uppercase tracking-widest transition-colors"
        >
          <Plus size={14} /> Novo Ativo
        </button>
      </div>

      <ListToolbar
        view={view}
        onViewChange={changeView}
        search={search}
        onSearchChange={changeSearch}
        placeholder="Buscar por nome, descrição ou categoria..."
        page={page}
        perPage={perPage}
        total={total}
        onPageChange={setPage}
      />

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
            {items.map((item) => (
              <tr key={item.id} className="hover:bg-bg-base transition-colors group">
                <td className="px-6 py-4">
                  <div className="font-medium">{item.name}</div>
                  {item.description && <div className="text-[10px] text-text-tertiary mt-1 max-w-[200px] truncate">{item.description}</div>}
                </td>
                <td className="px-6 py-4 text-text-tertiary">{item.category}</td>
                <td className="px-6 py-4 text-text-secondary">{item.quantity}</td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 border rounded-[2px] text-[10px] uppercase tracking-widest ${statusColor(item.status)}`}>
                    {item.status}
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex items-center justify-end gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                    {view === 'trashed' ? (
                      <button onClick={() => void handleRestore(item.id)} title="Restaurar" className="text-text-tertiary hover:text-status-success transition-colors">
                        <RotateCcw size={14} />
                      </button>
                    ) : (
                      <>
                        <button onClick={() => openEdit(item)} title="Editar" className="text-text-tertiary hover:text-text-primary transition-colors">
                          <Edit2 size={14} />
                        </button>
                        <button onClick={() => void handleDelete(item.id)} title="Mover para a lixeira" className="text-text-tertiary hover:text-status-danger transition-colors">
                          <Trash2 size={14} />
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-16 text-center text-text-tertiary">
                  <div className="flex flex-col items-center justify-center">
                    <Database size={24} className="mb-4 opacity-50" />
                    {view === 'trashed' ? (
                      <span>A lixeira está vazia.</span>
                    ) : search ? (
                      <span>Nenhum ativo encontrado para "{search}".</span>
                    ) : (
                      <>
                        <span>Nenhum ativo corporativo cadastrado.</span>
                        <button onClick={openCreate} className="mt-4 text-status-success hover:underline">
                          Cadastre o seu primeiro ativo
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <InventoryFormModal
          item={editing}
          onClose={closeModal}
          onSubmit={handleSubmit}
        />
      )}
    </div>
  );
}
