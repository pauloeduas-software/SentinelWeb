import { useEffect, useState } from 'react';
import axios from 'axios';
import { 
  Cpu, 
  MemoryStick, 
  HardDrive, 
  Monitor, 
  RefreshCw, 
  Globe, 
  Fingerprint, 
  Terminal,
  Clock,
  LayoutDashboard,
  Settings
} from 'lucide-react';

// --- Interfaces ---
interface Telemetry {
  cpuUsage: number;
  ramTotal: string;
  ramUsed: string;
  disks: Record<string, number>;
  timestamp: string;
}

interface Asset {
  id: string;
  hwid: string;
  hostname: string;
  osVersion: string;
  status: string;
  telemetries: Telemetry[];
}

// --- Componentes de UI Auxiliares ---

const StatusBadge = ({ status }: { status: string }) => (
  <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
    <div className="relative flex h-2 w-2">
      <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${status === 'ONLINE' ? 'bg-emerald-400' : 'bg-red-400'} opacity-75`}></span>
      <span className={`relative inline-flex rounded-full h-2 w-2 ${status === 'ONLINE' ? 'bg-emerald-500' : 'bg-red-500'}`}></span>
    </div>
    <span className={`text-[10px] font-black uppercase tracking-widest ${status === 'ONLINE' ? 'text-emerald-400' : 'text-red-400'}`}>
      {status === 'ONLINE' ? 'System Online' : 'Connection Lost'}
    </span>
  </div>
);

const ProgressBar = ({ value, colorClass }: { value: number; colorClass?: string }) => {
  const getColor = () => {
    if (colorClass) return colorClass;
    if (value < 70) return 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]';
    if (value < 85) return 'bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.4)]';
    return 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.4)]';
  };

  return (
    <div className="w-full bg-gray-800 rounded-full h-1.5 mt-2 overflow-hidden">
      <div 
        className={`h-full transition-all duration-1000 ease-out ${getColor()}`}
        style={{ width: `${Math.min(value, 100)}%` }}
      />
    </div>
  );
};

const MetricItem = ({ icon: Icon, label, value, color }: { icon: any, label: string, value: number, color: string }) => (
  <div className="flex flex-col gap-1">
    <div className="flex items-center justify-between mb-1">
      <div className="flex items-center gap-2 text-gray-500 text-[10px] font-bold uppercase tracking-wider">
        <Icon size={14} className={color} /> {label}
      </div>
      <span className={`text-xl font-black ${value > 85 ? 'text-red-400' : 'text-white'}`}>{value}%</span>
    </div>
    <ProgressBar value={value} />
  </div>
);

// --- Componente Principal do Card ---

const AssetCard = ({ asset }: { asset: Asset }) => {
  const telemetry = asset.telemetries[0];
  const ramTotalGB = telemetry ? (Number(telemetry.ramTotal) / 1024 / 1024 / 1024) : 0;
  const ramUsedGB = telemetry ? (Number(telemetry.ramUsed) / 1024 / 1024 / 1024) : 0;
  const ramPercent = ramTotalGB > 0 ? Math.round((ramUsedGB / ramTotalGB) * 100) : 0;
  
  const diskEntries = Object.entries(telemetry?.disks || {});
  const mainDisk = diskEntries.sort((a, b) => b[1] - a[1])[0] || ["Disk", 0];

  const timeAgo = telemetry ? new Date(telemetry.timestamp).toLocaleTimeString() : 'N/A';

  return (
    <div className="bg-[#161b22] border border-gray-800 rounded-2xl overflow-hidden hover:shadow-2xl hover:shadow-blue-500/5 transition-all duration-500 group">
      {/* Header do Card */}
      <div className="p-6 border-b border-gray-800/50">
        <div className="flex justify-between items-start mb-6">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 bg-gray-800 rounded-xl flex items-center justify-center text-gray-400 group-hover:text-blue-400 transition-colors border border-gray-700/50">
              <Monitor size={24} />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white tracking-tight">{asset.hostname}</h3>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px] font-mono text-gray-500 bg-gray-800/50 px-1.5 py-0.5 rounded">v1.0.4-agent</span>
              </div>
            </div>
          </div>
          <StatusBadge status={asset.status} />
        </div>

        {/* Tabs Mockup */}
        <div className="flex gap-4 border-b border-gray-800/50 -mb-px">
          <button className="text-[10px] font-bold uppercase tracking-widest pb-3 text-gray-500 hover:text-gray-300">Informações</button>
          <button className="text-[10px] font-bold uppercase tracking-widest pb-3 text-blue-500 border-b-2 border-blue-500">Telemetria</button>
          <button className="text-[10px] font-bold uppercase tracking-widest pb-3 text-gray-500 hover:text-gray-300">Auditoria</button>
        </div>
      </div>

      {/* Performance Section */}
      <div className="p-6 space-y-8">
        <div>
          <h4 className="text-[10px] font-black text-gray-600 uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
            <RefreshCw size={12} className="animate-spin" /> Performance em Tempo Real
          </h4>
          
          <div className="grid grid-cols-3 gap-6">
            <MetricItem icon={Cpu} label="CPU" value={telemetry?.cpuUsage || 0} color="text-amber-500" />
            <MetricItem icon={MemoryStick} label="Memória" value={ramPercent} color="text-blue-500" />
            <MetricItem icon={HardDrive} label="Disco" value={mainDisk[1]} color="text-emerald-500" />
          </div>
        </div>

        {/* System Info Section */}
        <div className="pt-6 border-t border-gray-800/50">
          <h4 className="text-[10px] font-black text-gray-600 uppercase tracking-[0.2em] mb-4">Informações do Sistema</h4>
          <div className="grid grid-cols-2 gap-y-4 gap-x-8">
            <div className="flex items-center gap-3">
              <Globe size={14} className="text-gray-600" />
              <div className="flex flex-col">
                <span className="text-[9px] font-bold text-gray-500 uppercase tracking-tighter">Endereço IP</span>
                <span className="text-xs font-mono text-gray-300">192.168.1.45</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Fingerprint size={14} className="text-gray-600" />
              <div className="flex flex-col">
                <span className="text-[9px] font-bold text-gray-500 uppercase tracking-tighter">MAC Address</span>
                <span className="text-xs font-mono text-gray-300">00:1B:44:11:3A:B7</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Terminal size={14} className="text-gray-600" />
              <div className="flex flex-col">
                <span className="text-[9px] font-bold text-gray-500 uppercase tracking-tighter">OS Kernel</span>
                <span className="text-xs font-mono text-gray-300 truncate w-24">{asset.osVersion}</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Clock size={14} className="text-gray-600" />
              <div className="flex flex-col">
                <span className="text-[9px] font-bold text-gray-500 uppercase tracking-tighter">Última Atualização</span>
                <span className="text-xs font-mono text-gray-300">{timeAgo}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer Info */}
      <div className="px-6 py-4 bg-gray-900/30 flex justify-between items-center border-t border-gray-800">
         <span className="text-[10px] text-gray-600 font-mono">ID: {asset.hwid.substring(0, 16)}...</span>
         <div className="flex items-center gap-2">
            <span className="text-[10px] text-gray-500 uppercase font-bold tracking-widest">{ramUsedGB.toFixed(1)}GB / {ramTotalGB.toFixed(1)}GB</span>
         </div>
      </div>
    </div>
  );
};

// --- App Root ---

export default function App() {
  const [assets, setAssets] = useState<Asset[]>([]);

  const fetchAssets = async () => {
    try {
      const response = await axios.get('http://localhost:5000/api/assets');
      setAssets(response.data);
    } catch (error) {
      console.error('API Error:', error);
    }
  };

  useEffect(() => {
    fetchAssets();
    const interval = setInterval(fetchAssets, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-[#0d1117] text-gray-300 selection:bg-blue-500/30">
      
      {/* Top Navbar */}
      <nav className="h-16 border-b border-gray-800 bg-[#0d1117]/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto h-full flex items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <div className="p-1.5 bg-blue-600 rounded-lg shadow-lg shadow-blue-500/20">
              <LayoutDashboard size={20} className="text-white" />
            </div>
            <h1 className="text-lg font-black text-white tracking-tighter uppercase">Asset<span className="text-blue-500">Manager</span></h1>
          </div>
          <div className="flex items-center gap-6">
             <div className="hidden md:flex gap-4 text-[11px] font-black uppercase tracking-widest text-gray-500">
                <a href="#" className="text-white">Infraestrutura</a>
                <a href="#" className="hover:text-gray-300 transition-colors">Relatórios</a>
                <a href="#" className="hover:text-gray-300 transition-colors">Alertas</a>
             </div>
             <div className="h-8 w-8 rounded-full bg-gray-800 border border-gray-700 flex items-center justify-center text-gray-500 hover:text-white cursor-pointer transition-colors">
                <Settings size={16} />
             </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto p-8 lg:p-12">
        <header className="mb-12">
          <h2 className="text-4xl font-black text-white tracking-tighter mb-2">Monitoramento de Ativos</h2>
          <p className="text-gray-500 text-lg">Gerenciamento e telemetria de infraestrutura distribuída em tempo real.</p>
        </header>

        {/* Grid de Ativos */}
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-8">
          {assets.map((asset) => (
            <AssetCard key={asset.id} asset={asset} />
          ))}
        </div>

        {/* Empty State */}
        {assets.length === 0 && (
          <div className="py-40 flex flex-col items-center text-center">
            <div className="w-24 h-24 bg-gray-900 rounded-full flex items-center justify-center border border-gray-800 mb-6">
              <RefreshCw size={40} className="text-gray-700 animate-spin" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Aguardando Conexões</h3>
            <p className="text-gray-500 max-w-xs mx-auto">Inicie o agente nas máquinas físicas para que elas apareçam automaticamente no seu inventário.</p>
          </div>
        )}
      </main>

      <footer className="max-w-7xl mx-auto p-12 border-t border-gray-800 text-[10px] font-mono text-gray-600 flex justify-between uppercase tracking-[0.2em]">
        <span>&copy; 2026 Sentinel Systems</span>
        <div className="flex gap-6">
           <span>Status: Operational</span>
           <span>Latency: 14ms</span>
        </div>
      </footer>
    </div>
  );
}
