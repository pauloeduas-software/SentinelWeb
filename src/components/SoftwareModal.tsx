import { useState } from 'react';
import { X, Search, Package, Box } from 'lucide-react';

interface SoftwareModalProps {
  isOpen: boolean;
  onClose: () => void;
  softwareList: string[];
  hostname: string;
}

export default function SoftwareModal({ isOpen, onClose, softwareList, hostname }: SoftwareModalProps) {
  const [searchTerm, setSearchTerm] = useState('');

  if (!isOpen) return null;

  const filteredList = softwareList.filter(item => 
    item.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/80 backdrop-blur-sm" 
        onClick={onClose}
      />

      {/* Modal Content */}
      <div className="relative w-full max-w-2xl bg-[#111113] border border-gray-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
        
        {/* Header */}
        <div className="p-6 border-b border-gray-800 flex items-center justify-between bg-gray-900/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/10 text-blue-500 rounded-lg">
              <Package size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white leading-tight">Inventário de Softwares</h2>
              <p className="text-xs text-gray-500 font-mono uppercase">{hostname}</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-gray-800 rounded-full text-gray-500 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Search Bar */}
        <div className="p-4 bg-[#161b22] border-b border-gray-800">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
            <input 
              type="text"
              placeholder="Pesquisar por nome do software..."
              className="w-full bg-gray-900 border border-gray-800 rounded-xl py-2.5 pl-10 pr-4 text-sm text-gray-200 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              autoFocus
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
          {filteredList.length > 0 ? (
            <ul className="space-y-1">
              {filteredList.map((software, index) => (
                <li 
                  key={index}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-gray-800/50 group transition-all"
                >
                  <Box size={14} className="text-gray-600 group-hover:text-blue-400" />
                  <span className="text-sm text-gray-300 group-hover:text-white">{software}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-gray-600">
              <Package size={48} className="opacity-20 mb-4" />
              <p className="text-sm font-medium">
                {softwareList.length === 0 ? 'Nenhum software detectado' : 'Nenhum resultado para a busca'}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-gray-900/30 border-t border-gray-800 flex justify-between items-center text-[10px] font-bold text-gray-500 uppercase tracking-widest px-6">
          <span>{filteredList.length} Itens Encontrados</span>
          <span>Sentinel Inventory v2.0</span>
        </div>
      </div>
    </div>
  );
}
