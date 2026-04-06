import { useEffect, useState } from 'react';
import axios from 'axios';
import { RefreshCw, LayoutDashboard } from 'lucide-react';
import AssetCard from './components/AssetCard';
import AssetDetailModal from './components/AssetDetailModal';

// --- Interfaces ---
interface Telemetry {
  cpuUsage: number;
  ramTotal: string;
  ramUsed: string;
  disks: Record<string, { totalGb?: number; usedGb?: number; TotalGb?: number; UsedGb?: number }>;
  timestamp: string;
}

interface Asset {
  id: string;
  hwid: string;
  hostname: string;
  osVersion: string;
  macAddress?: string;
  localIp?: string;
  status: string;
  telemetries: Telemetry[];
}

export default function App() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);

  const fetchAssets = async () => {
    setIsRefreshing(true);
    try {
      const response = await axios.get('http://localhost:5000/api/assets');
      setAssets(response.data);
    } catch (error) {
      console.error('[Sentinel] API Error:', error);
    } finally {
      // Small delay for visual feedback on refresh button
      setTimeout(() => setIsRefreshing(false), 500);
    }
  };

  useEffect(() => {
    fetchAssets();
    const interval = setInterval(fetchAssets, 5000);
    return () => clearInterval(interval);
  }, []);

  const onlineCount = assets.filter(a => a.status === 'ONLINE').length;
  const totalCount = assets.length;

  return (
    <div className="min-h-screen bg-bg-base text-text-primary selection:bg-status-info/20 font-sans">
      
      {/* minimalist fixed Header */}
      <header className="h-14 border-b border-border-sutil bg-bg-base sticky top-0 z-40 flex items-center px-6 justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-text-primary p-1 rounded-sm">
            <LayoutDashboard size={14} className="text-bg-base" />
          </div>
          <h1 className="text-sm font-bold tracking-tight uppercase">Sentinel</h1>
        </div>

        <div className="flex items-center gap-6">
          <div className="text-[11px] font-mono font-medium text-text-secondary tracking-widest uppercase">
            <span className="text-status-success">{onlineCount}</span> 
            <span className="mx-1.5 opacity-30">/</span> 
            <span className="text-text-primary">{totalCount}</span> 
            <span className="ml-2">online</span>
          </div>
          <button 
            onClick={fetchAssets}
            disabled={isRefreshing}
            className="p-2 hover:bg-surface-card rounded-md border border-transparent hover:border-border-sutil transition-all text-text-secondary hover:text-text-primary disabled:opacity-50"
          >
            <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="p-6 md:p-8">
        
        {/* Responsive Grid: grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {assets.map((asset) => (
            <AssetCard 
              key={asset.id} 
              asset={asset} 
              onViewDetails={setSelectedAsset} 
            />
          ))}
        </div>

        {/* Empty State */}
        {assets.length === 0 && !isRefreshing && (
          <div className="h-[calc(100vh-120px)] flex flex-col items-center justify-center text-center">
            <div className="w-12 h-12 bg-surface-card border border-border-sutil rounded-md flex items-center justify-center mb-6">
              <RefreshCw size={20} className="text-text-tertiary" />
            </div>
            <h3 className="text-sm font-medium text-text-primary">NO_SIGNALS_DETECTED</h3>
            <p className="text-xs text-text-secondary mt-2 max-w-[240px]">
              Waiting for incoming connections from Sentinel Agents...
            </p>
          </div>
        )}
      </main>

      {/* Modal Integration */}
      {selectedAsset && (
        <AssetDetailModal 
          asset={selectedAsset} 
          onClose={() => setSelectedAsset(null)} 
        />
      )}
    </div>
  );
}
