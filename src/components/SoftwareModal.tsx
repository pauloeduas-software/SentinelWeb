import { useState } from 'react';
import { X, Search, Package, Box, ChevronRight } from 'lucide-react';

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
        className="absolute inset-0 bg-[#080c12]/90 backdrop-blur-md"
        onClick={onClose}
      />

      {/* Glow blob behind modal */}
      <div className="absolute pointer-events-none w-[500px] h-[400px] bg-blue-600/10 rounded-full blur-3xl" />

      {/* Modal */}
      <div className="relative w-full max-w-xl flex flex-col max-h-[85vh] rounded-2xl overflow-hidden border border-white/[0.08] shadow-2xl shadow-blue-500/5"
           style={{ background: 'linear-gradient(160deg, #111827 0%, #0f1622 100%)' }}>

        {/* Top accent line */}
        <div className="h-px w-full bg-gradient-to-r from-transparent via-blue-500/60 to-transparent" />

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/[0.05]">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-600/20 to-blue-900/10 border border-blue-500/20 flex items-center justify-center">
              <Package size={18} className="text-blue-400" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white leading-tight">Inventário de Software</h2>
              <p className="text-[10px] font-mono text-gray-600 uppercase mt-0.5">{hostname}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="h-8 w-8 rounded-full flex items-center justify-center text-gray-600 hover:text-white hover:bg-white/5 transition-all"
          >
            <X size={16} />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 py-3 border-b border-white/[0.05] bg-white/[0.01]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" size={14} />
            <input
              type="text"
              placeholder="Pesquisar software..."
              className="w-full bg-white/[0.03] border border-white/[0.07] rounded-xl py-2.5 pl-9 pr-4 text-sm text-gray-300 placeholder-gray-700 focus:outline-none focus:border-blue-500/40 focus:ring-1 focus:ring-blue-500/20 transition-all font-medium"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              autoFocus
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-3">
          {filteredList.length > 0 ? (
            <ul className="space-y-0.5">
              {filteredList.map((software, index) => (
                <li
                  key={index}
                  className="group flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/[0.04] transition-all cursor-default"
                >
                  <div className="flex-shrink-0 w-6 h-6 rounded-lg bg-white/[0.03] border border-white/[0.05] flex items-center justify-center group-hover:border-blue-500/20 group-hover:bg-blue-500/5 transition-all">
                    <Box size={11} className="text-gray-700 group-hover:text-blue-500 transition-colors" />
                  </div>
                  <span className="text-sm text-gray-400 group-hover:text-gray-200 transition-colors flex-1 leading-tight">
                    {software}
                  </span>
                  <ChevronRight size={12} className="text-gray-800 group-hover:text-gray-600 transition-colors flex-shrink-0" />
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="h-14 w-14 rounded-2xl bg-white/[0.02] border border-white/[0.05] flex items-center justify-center mb-4">
                <Package size={28} className="text-gray-700" />
              </div>
              <p className="text-sm font-medium text-gray-600">
                {softwareList.length === 0
                  ? 'Nenhum software detectado'
                  : 'Nenhum resultado para a busca'}
              </p>
              {searchTerm && (
                <p className="text-xs text-gray-700 mt-1">
                  Tente um termo diferente
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-white/[0.05] px-6 py-3 bg-white/[0.015] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-gray-700">
              {filteredList.length}
              {searchTerm ? ` de ${softwareList.length}` : ''} itens
            </span>
          </div>
          <span className="text-[10px] font-mono text-gray-700 uppercase tracking-widest">
            Sentinel Inventory v2.0
          </span>
        </div>
      </div>
    </div>
  );
}
