import { ArrowRight } from 'lucide-react';

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

interface AssetCardProps {
  asset: Asset;
  onViewDetails: (asset: Asset) => void;
}

const ProgressBar = ({ label, value }: { label: string; value: number }) => {
  const getColor = (v: number) => {
    if (v < 60) return 'bg-status-success';
    if (v < 85) return 'bg-status-warning';
    return 'bg-status-danger';
  };

  return (
    <div className="space-y-1.5">
      <div className="flex justify-between items-center text-[10px] font-mono uppercase tracking-tight">
        <span className="text-text-secondary">{label}</span>
        <span className="text-text-primary">{Math.round(value)}%</span>
      </div>
      <div className="h-1.5 w-full bg-border-sutil overflow-hidden">
        <div 
          className={`h-full transition-all duration-500 ease-out ${getColor(value)}`} 
          style={{ width: `${Math.min(value, 100)}%` }}
        />
      </div>
    </div>
  );
};

export default function AssetCard({ asset, onViewDetails }: AssetCardProps) {
  const telemetry = asset.telemetries?.[0];
  const isOnline = asset.status === 'ONLINE';

  // RAM Calculation
  const ramTotalGB = telemetry ? (Number(telemetry.ramTotal) / 1024 / 1024 / 1024) : 0;
  const ramUsedGB = telemetry ? (Number(telemetry.ramUsed) / 1024 / 1024 / 1024) : 0;
  const ramPercent = ramTotalGB > 0 ? (ramUsedGB / ramTotalGB) * 100 : 0;

  // Disk Calculation (main disk)
  const diskEntries = Object.entries(telemetry?.disks || {});
  const mainDisk = diskEntries[0]?.[1] || { totalGb: 0, usedGb: 0 };
  const mainTotal = (mainDisk as any).totalGb ?? (mainDisk as any).TotalGb ?? 0;
  const mainUsed = (mainDisk as any).usedGb ?? (mainDisk as any).UsedGb ?? 0;
  const diskPercent = mainTotal > 0 ? (mainUsed / mainTotal) * 100 : 0;

  return (
    <div 
      className={`
        group relative flex flex-col bg-surface-card border p-5 transition-all duration-200
        ${isOnline ? 'border-border-sutil hover:border-border-hover' : 'border-border-sutil'}
      `}
    >
      {/* Top Header */}
      <div className="flex justify-between items-start mb-6">
        <div className="flex items-center gap-2">
          <div className={`h-2 w-2 rounded-full ${isOnline ? 'bg-status-success animate-pulse' : 'bg-text-tertiary'}`} />
          <span className={`text-[10px] font-mono font-bold tracking-widest uppercase ${isOnline ? 'text-status-success' : 'text-text-secondary'}`}>
            {asset.status}
          </span>
        </div>
        <div className="text-[10px] font-mono text-text-tertiary uppercase">
          [{asset.osVersion.split(' ')[0] || 'System'}]
        </div>
      </div>

      {/* Hostname Section */}
      <div className="mb-8">
        <h3 className="text-xl font-mono font-medium text-text-primary truncate" title={asset.hostname}>
          {asset.hostname}
        </h3>
        <p className="text-[10px] font-mono text-text-tertiary mt-1">
          {asset.localIp || '0.0.0.0'}
        </p>
      </div>

      {/* Metrics Section */}
      <div className={`space-y-4 mb-8 transition-all duration-500 ${!isOnline ? 'grayscale saturate-50 opacity-80' : ''}`}>
        <ProgressBar label="CPU" value={telemetry?.cpuUsage || 0} />
        <ProgressBar label="MEM" value={ramPercent} />
        <ProgressBar label="DSK" value={diskPercent} />
      </div>

      {/* Footer */}
      <div className="mt-auto pt-4 border-t border-border-sutil/50">
        <button 
          onClick={() => onViewDetails(asset)}
          className="flex items-center gap-1.5 text-[11px] font-medium text-text-secondary hover:text-text-primary transition-colors group/btn"
        >
          Ver detalhes 
          <ArrowRight size={12} className="transition-transform group-hover/btn:translate-x-0.5" />
        </button>
      </div>
    </div>
  );
}
