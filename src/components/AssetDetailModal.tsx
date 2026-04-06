import { useState } from 'react';
import { 
  X, 
  Copy, 
  Check, 
  RotateCcw, 
  Moon, 
  Power, 
  AlertCircle,
  HardDrive
} from 'lucide-react';
import { LineChart, Line, ResponsiveContainer } from 'recharts';
import axios from 'axios';

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

interface AssetDetailModalProps {
  asset: Asset;
  onClose: () => void;
}

const InfoRow = ({ label, value, copyable = false }: { label: string; value: string; copyable?: boolean }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex items-center justify-between py-2 border-b border-border-sutil last:border-0">
      <span className="text-[11px] font-medium text-text-tertiary uppercase tracking-tight">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-xs font-mono text-text-primary">{value}</span>
        {copyable && (
          <button 
            onClick={handleCopy}
            className="p-1 hover:bg-border-sutil rounded transition-colors text-text-tertiary hover:text-text-primary"
          >
            {copied ? <Check size={12} className="text-status-success" /> : <Copy size={12} />}
          </button>
        )}
      </div>
    </div>
  );
};

export default function AssetDetailModal({ asset, onClose }: AssetDetailModalProps) {
  const [activeTab, setActiveTab] = useState<'telemetry' | 'actions'>('telemetry');
  const [confirmAction, setConfirmAction] = useState<string | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);

  const telemetry = asset.telemetries?.[0];
  const isOnline = asset.status === 'ONLINE';

  // RAM Calculation
  const ramTotalGB = telemetry ? (Number(telemetry.ramTotal) / 1024 / 1024 / 1024) : 0;
  const ramUsedGB = telemetry ? (Number(telemetry.ramUsed) / 1024 / 1024 / 1024) : 0;

  // Mock CPU History for Sparkline (last 15 points)
  // In a real app, this would come from the API
  const cpuHistory = asset.telemetries.slice(0, 15).reverse().map((t, i) => ({
    value: t.cpuUsage,
    index: i
  }));

  const handleRemoteAction = async (action: string) => {
    if (confirmAction !== action) {
      setConfirmAction(action);
      return;
    }

    setIsExecuting(true);
    try {
      await axios.post(`http://localhost:5000/api/assets/${asset.hwid}/command`, { action });
      setConfirmAction(null);
    } catch (error) {
      console.error('[Sentinel] Command failed:', error);
      alert('Falha ao executar comando remoto.');
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Overlay */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" 
        onClick={onClose} 
      />

      {/* Modal */}
      <div className="relative w-full max-w-lg bg-surface-card border border-border-sutil shadow-2xl animate-in fade-in slide-in-from-bottom-2 duration-150 overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-sutil bg-bg-base/50">
          <div className="flex flex-col">
            <h2 className="text-lg font-mono font-medium text-text-primary tracking-tight">{asset.hostname}</h2>
            <div className="flex items-center gap-2 mt-1">
              <div className={`h-1.5 w-1.5 rounded-full ${isOnline ? 'bg-status-success' : 'bg-text-tertiary'}`} />
              <span className="text-[10px] font-mono text-text-tertiary uppercase tracking-widest">{asset.status}</span>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-border-sutil rounded-md transition-colors text-text-tertiary hover:text-text-primary"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex px-6 border-b border-border-sutil">
          <button 
            onClick={() => setActiveTab('telemetry')}
            className={`px-4 py-3 text-[11px] font-bold uppercase tracking-widest transition-all border-b-2 ${activeTab === 'telemetry' ? 'border-text-primary text-text-primary' : 'border-transparent text-text-tertiary hover:text-text-secondary'}`}
          >
            Telemetria
          </button>
          <button 
            onClick={() => setActiveTab('actions')}
            className={`px-4 py-3 text-[11px] font-bold uppercase tracking-widest transition-all border-b-2 ${activeTab === 'actions' ? 'border-text-primary text-text-primary' : 'border-transparent text-text-tertiary hover:text-text-secondary'}`}
          >
            Ações Remotas
          </button>
        </div>

        {/* Content */}
        <div className="p-6 max-h-[70vh] overflow-y-auto">
          {activeTab === 'telemetry' ? (
            <div className="space-y-8">
              {/* Basic Info */}
              <div className="space-y-1">
                <InfoRow label="Hostname" value={asset.hostname} />
                <InfoRow label="HWID" value={asset.hwid} copyable />
                <InfoRow label="IP Local" value={asset.localIp || '0.0.0.0'} />
                <InfoRow label="MAC Address" value={asset.macAddress?.toUpperCase() || 'N/A'} />
                <InfoRow label="SO" value={asset.osVersion} />
                <InfoRow label="RAM Total" value={`${ramTotalGB.toFixed(1)} GB`} />
              </div>

              {/* Storage Units */}
              <div>
                <h3 className="text-[10px] font-bold text-text-tertiary uppercase tracking-[0.2em] mb-4">Unidades de Armazenamento</h3>
                <div className="space-y-4">
                  {Object.entries(telemetry?.disks || {}).map(([name, data]: [string, any]) => {
                    const total = data?.totalGb ?? data?.TotalGb ?? 0;
                    const used = data?.usedGb ?? data?.UsedGb ?? 0;
                    const pct = total > 0 ? (used / total) * 100 : 0;
                    
                    return (
                      <div key={name} className="space-y-2">
                        <div className="flex justify-between items-center text-[11px] font-mono">
                          <span className="text-text-secondary">{name}</span>
                          <span className="text-text-tertiary">{used.toFixed(1)}GB / {total.toFixed(1)}GB <span className="ml-2 text-text-primary">{Math.round(pct)}%</span></span>
                        </div>
                        <div className="h-1.5 w-full bg-border-sutil">
                          <div 
                            className={`h-full bg-text-primary transition-all duration-700`}
                            style={{ width: `${Math.min(pct, 100)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* CPU Sparkline */}
              <div>
                <h3 className="text-[10px] font-bold text-text-tertiary uppercase tracking-[0.2em] mb-4">Histórico CPU (últimos 15 pontos)</h3>
                <div className="h-20 w-full bg-bg-base/50 border border-border-sutil p-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={cpuHistory}>
                      <Line 
                        type="monotone" 
                        dataKey="value" 
                        stroke="#ededed" 
                        strokeWidth={1.5} 
                        dot={false}
                        animationDuration={1000}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-8 py-4">
              <div className="flex items-start gap-4 p-4 bg-status-warning/5 border border-status-warning/20">
                <AlertCircle className="text-status-warning shrink-0" size={20} />
                <p className="text-xs text-status-warning leading-relaxed">
                  <span className="font-bold">Atenção:</span> estas ações afetam a máquina imediatamente. Certifique-se de que nenhum trabalho importante esteja pendente no host remoto.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3">
                <button 
                  onClick={() => handleRemoteAction('REBOOT')}
                  disabled={isExecuting || !isOnline}
                  className={`flex items-center justify-between p-4 border transition-all text-sm font-medium disabled:opacity-30
                    ${confirmAction === 'REBOOT' ? 'bg-status-info/10 border-status-info text-status-info' : 'bg-surface-card border-border-sutil text-text-secondary hover:text-text-primary hover:border-text-primary'}
                  `}
                >
                  <div className="flex items-center gap-3">
                    <RotateCcw size={16} />
                    <span>{confirmAction === 'REBOOT' ? 'Clique para confirmar reinicialização' : 'Reiniciar Máquina'}</span>
                  </div>
                  {confirmAction === 'REBOOT' && <div className="animate-pulse h-2 w-2 rounded-full bg-status-info" />}
                </button>

                <button 
                  onClick={() => handleRemoteAction('SUSPEND')}
                  disabled={isExecuting || !isOnline}
                  className={`flex items-center justify-between p-4 border transition-all text-sm font-medium disabled:opacity-30
                    ${confirmAction === 'SUSPEND' ? 'bg-status-warning/10 border-status-warning text-status-warning' : 'bg-surface-card border-border-sutil text-text-secondary hover:text-text-primary hover:border-text-primary'}
                  `}
                >
                  <div className="flex items-center gap-3">
                    <Moon size={16} />
                    <span>{confirmAction === 'SUSPEND' ? 'Clique para confirmar suspensão' : 'Suspender Máquina'}</span>
                  </div>
                  {confirmAction === 'SUSPEND' && <div className="animate-pulse h-2 w-2 rounded-full bg-status-warning" />}
                </button>

                <button 
                  onClick={() => handleRemoteAction('SHUTDOWN')}
                  disabled={isExecuting || !isOnline}
                  className={`flex items-center justify-between p-4 border transition-all text-sm font-medium disabled:opacity-30
                    ${confirmAction === 'SHUTDOWN' ? 'bg-status-danger/10 border-status-danger text-status-danger' : 'bg-surface-card border-border-sutil text-text-secondary hover:text-text-primary hover:border-text-primary'}
                  `}
                >
                  <div className="flex items-center gap-3">
                    <Power size={16} />
                    <span>{confirmAction === 'SHUTDOWN' ? 'Clique para confirmar desligamento' : 'Desligar Máquina'}</span>
                  </div>
                  {confirmAction === 'SHUTDOWN' && <div className="animate-pulse h-2 w-2 rounded-full bg-status-danger" />}
                </button>
              </div>

              {confirmAction && (
                <button 
                  onClick={() => setConfirmAction(null)}
                  className="w-full text-center text-[11px] font-bold uppercase tracking-widest text-text-tertiary hover:text-text-primary"
                >
                  Cancelar ação
                </button>
              )}
            </div>
          )}
        </div>

        {/* Footer info */}
        <div className="px-6 py-3 border-t border-border-sutil bg-bg-base/30 flex justify-between items-center">
          <span className="text-[9px] font-mono text-text-tertiary uppercase tracking-widest">Sentinel Remote Agent v1.0.4</span>
          <div className="flex items-center gap-2">
             <div className={`h-1 w-1 rounded-full ${isOnline ? 'bg-status-success' : 'bg-text-tertiary'}`} />
             <span className="text-[9px] font-mono text-text-tertiary uppercase">{isOnline ? 'Session Active' : 'Disconnected'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
