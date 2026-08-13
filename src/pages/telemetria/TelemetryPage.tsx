import { useEffect, useState } from 'react';
import axios from 'axios';
import { RefreshCw } from 'lucide-react';
import AssetCard from './components/AssetCard';
import AssetDetailModal from './components/AssetDetailModal';
import type { Asset } from '../../types';

export default function TelemetryPage() {
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
      setTimeout(() => setIsRefreshing(false), 500);
    }
  };

  useEffect(() => {
    fetchAssets();
    const interval = setInterval(fetchAssets, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="animate-in fade-in duration-300">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-mono text-text-primary uppercase tracking-widest">RMM / Telemetria</h2>
        <button 
          onClick={fetchAssets}
          disabled={isRefreshing}
          className="p-2 hover:bg-surface-card rounded-md border border-transparent hover:border-border-sutil transition-all text-text-secondary hover:text-text-primary disabled:opacity-50"
        >
          <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {assets.map((asset) => (
          <AssetCard 
            key={asset.id} 
            asset={asset} 
            onViewDetails={setSelectedAsset} 
          />
        ))}
      </div>

      {assets.length === 0 && !isRefreshing && (
        <div className="h-[50vh] flex flex-col items-center justify-center text-center">
          <div className="w-12 h-12 bg-surface-card border border-border-sutil rounded-md flex items-center justify-center mb-6">
            <RefreshCw size={20} className="text-text-tertiary" />
          </div>
          <h3 className="text-sm font-medium text-text-primary">NENHUM SINAL DETECTADO</h3>
          <p className="text-xs text-text-secondary mt-2 max-w-[240px]">
            Aguardando conexões dos Agentes Sentinel...
          </p>
        </div>
      )}

      {selectedAsset && (
        <AssetDetailModal 
          asset={selectedAsset} 
          onClose={() => setSelectedAsset(null)} 
        />
      )}
    </div>
  );
}
