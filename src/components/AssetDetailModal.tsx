import React, { useState } from 'react';
import { X, Cpu, Activity, Network, Terminal, Info, Copy, Power, RefreshCw, Lock, Download, Upload } from 'lucide-react';
import type { Asset, DiskMetrics, NetworkMetrics, ProcessMetrics } from '../types';

interface AssetDetailModalProps { asset: Asset; onClose: () => void; }

export default function AssetDetailModal({ asset, onClose }: AssetDetailModalProps) {
  const [activeTab, setActiveTab] = useState<'telemetry' | 'processes' | 'info' | 'actions'>('telemetry');
  
  const telemetry = asset.telemetries?.[0];
  const isOnline = asset.status === 'ONLINE';

  const parseJson = (data: any) => {
    if (!data) return null;
    if (typeof data === 'string') { try { return JSON.parse(data); } catch { return null; } }
    return data;
  };

  const disks: DiskMetrics[] = parseJson(telemetry?.disks) || [];
  const network: NetworkMetrics = parseJson(telemetry?.network) || { bytesReceived: 0, bytesSent: 0 };
  const topProcesses: ProcessMetrics[] = parseJson(telemetry?.topProcesses) || [];

  const ramTotalGB = telemetry ? (Number(telemetry.ramTotal) / 1024 / 1024 / 1024) : 0;
  const ramUsedGB = telemetry ? (Number(telemetry.ramUsed) / 1024 / 1024 / 1024) : 0;
  const cpuUsage = telemetry ? Number(telemetry.cpuUsage) : 0;

  const truncateHwid = (hwid: string) => hwid.length > 20 ? `${hwid.substring(0, 15)}...${hwid.substring(hwid.length - 5)}` : hwid;

  const handleCommand = async (action: string) => {
    const upperAction = action.toUpperCase();
    if (!confirm(`CUIDADO: Tem certeza que deseja enviar o comando de ${upperAction} para a máquina?`)) return;
    try {
      const res = await fetch(`http://localhost:5000/api/assets/${asset.hwid}/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: upperAction })
      });
      if (!res.ok) throw new Error('Falha');
      alert('Comando disparado com sucesso!');
    } catch (e) {
      alert('Erro: Não foi possível enviar o comando. O Agente pode estar offline.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-bg-base/80 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl bg-surface-card border border-border-sutil shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-sutil bg-bg-base/50 shrink-0">
          <div>
            <h2 className="text-xl font-mono text-text-primary">{asset.hostname}</h2>
            <div className="flex items-center gap-2 mt-1">
              <div className={`h-2 w-2 rounded-full ${isOnline ? 'bg-status-success' : 'bg-text-tertiary'}`} />
              <span className="text-[10px] font-mono text-text-secondary uppercase tracking-widest">{isOnline ? 'ONLINE' : 'OFFLINE'}</span>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-text-tertiary hover:text-text-primary transition-colors"><X size={20} /></button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border-sutil shrink-0 px-2 bg-surface-card overflow-x-auto">
          <button onClick={() => setActiveTab('telemetry')} className={`px-4 py-3 text-xs font-mono tracking-widest uppercase transition-colors border-b-2 whitespace-nowrap ${activeTab === 'telemetry' ? 'border-status-success text-status-success' : 'border-transparent text-text-tertiary hover:text-text-secondary'}`}><Activity size={14} className="inline mr-2" />TELEMETRIA</button>
          <button onClick={() => setActiveTab('processes')} className={`px-4 py-3 text-xs font-mono tracking-widest uppercase transition-colors border-b-2 whitespace-nowrap ${activeTab === 'processes' ? 'border-status-success text-status-success' : 'border-transparent text-text-tertiary hover:text-text-secondary'}`}><Terminal size={14} className="inline mr-2" />PROCESSOS</button>
          <button onClick={() => setActiveTab('info')} className={`px-4 py-3 text-xs font-mono tracking-widest uppercase transition-colors border-b-2 whitespace-nowrap ${activeTab === 'info' ? 'border-status-success text-status-success' : 'border-transparent text-text-tertiary hover:text-text-secondary'}`}><Info size={14} className="inline mr-2" />INFO</button>
          <button onClick={() => setActiveTab('actions')} className={`px-4 py-3 text-xs font-mono tracking-widest uppercase transition-colors border-b-2 whitespace-nowrap ${activeTab === 'actions' ? 'border-status-success text-status-success' : 'border-transparent text-text-tertiary hover:text-text-secondary'}`}><Power size={14} className="inline mr-2" />AÇÕES</button>
        </div>

        {/* Content Area */}
        <div className="p-6 overflow-y-auto custom-scrollbar flex-1 bg-bg-base/20">
          
          {/* TAB: TELEMETRY */}
          {activeTab === 'telemetry' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-surface-card border border-border-sutil">
                  <div className="flex justify-between items-center mb-2"><span className="text-xs font-mono text-text-secondary">CPU</span><Cpu size={14} className="text-status-success" /></div>
                  <div className="text-2xl font-mono text-text-primary mb-1">{cpuUsage.toFixed(1)}%</div>
                  <div className="w-full bg-border-sutil h-1 mt-2"><div className="bg-status-success h-1" style={{ width: `${Math.min(cpuUsage, 100)}%` }} /></div>
                </div>
                <div className="p-4 bg-surface-card border border-border-sutil">
                  <div className="flex justify-between items-center mb-2"><span className="text-xs font-mono text-text-secondary">RAM</span><Activity size={14} className="text-status-success" /></div>
                  <div className="text-2xl font-mono text-text-primary mb-1">{ramUsedGB.toFixed(1)} <span className="text-sm text-text-tertiary">/ {ramTotalGB.toFixed(1)} GB</span></div>
                  <div className="w-full bg-border-sutil h-1 mt-2"><div className="bg-status-success h-1" style={{ width: `${ramTotalGB > 0 ? Math.min((ramUsedGB / ramTotalGB) * 100, 100) : 0}%` }} /></div>
                </div>
              </div>
              <div>
                <h3 className="text-[10px] font-mono text-text-secondary mb-3 tracking-widest">TRÁFEGO DE REDE</h3>
                <div className="grid grid-cols-2 gap-y-6 gap-x-8 p-2">
                  {/* Recebendo (Atual) */}
                  <div className="flex gap-3">
                    <div className="w-[2px] bg-status-success/50 rounded-full"></div>
                    <div>
                      <div className="text-[10px] font-mono text-text-secondary uppercase tracking-widest mb-1">Recebendo</div>
                      <div className="text-xl font-mono font-bold text-text-primary">
                        {(network as any).rxSpeedKbps || 0} <span className="text-[10px] text-text-tertiary font-normal">Kbps</span>
                      </div>
                    </div>
                  </div>

                  {/* Enviando (Atual) */}
                  <div className="flex gap-3">
                    <div className="w-[2px] border-l-[2px] border-dotted border-status-success/50"></div>
                    <div>
                      <div className="text-[10px] font-mono text-text-secondary uppercase tracking-widest mb-1">Enviando</div>
                      <div className="text-xl font-mono font-bold text-text-primary">
                        {(network as any).txSpeedKbps || 0} <span className="text-[10px] text-text-tertiary font-normal">Kbps</span>
                      </div>
                    </div>
                  </div>

                  {/* Total Recebido */}
                  <div className="flex gap-3">
                    <div className="w-[2px]"></div> 
                    <div>
                      <div className="text-[10px] font-mono text-text-secondary uppercase tracking-widest mb-1">Total Recebido</div>
                      <div className="text-lg font-mono text-text-primary">
                        {(network as any).totalRxGb || 0} <span className="text-[10px] text-text-tertiary">Gb</span>
                      </div>
                    </div>
                  </div>

                  {/* Total Enviado */}
                  <div className="flex gap-3">
                    <div className="w-[2px]"></div>
                    <div>
                      <div className="text-[10px] font-mono text-text-secondary uppercase tracking-widest mb-1">Total Enviado</div>
                      <div className="text-lg font-mono text-text-primary">
                        {(network as any).totalTxGb || 0} <span className="text-[10px] text-text-tertiary">Gb</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div>
                <h3 className="text-[10px] font-mono text-text-secondary mb-3 tracking-widest">ARMAZENAMENTO</h3>
                <div className="space-y-3">
                  {disks.map((d, i) => (
                    <div key={i} className="text-xs font-mono">
                      <div className="flex justify-between mb-1 text-text-primary"><span>{d.name}</span><span>{d.usedGb.toFixed(1)}GB / {d.totalGb.toFixed(1)}GB</span></div>
                      <div className="w-full bg-border-sutil h-1"><div className="bg-status-success h-1" style={{ width: `${Math.min((d.usedGb / d.totalGb) * 100, 100)}%` }} /></div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB: PROCESSES */}
          {activeTab === 'processes' && (
            <div className="overflow-x-auto">
               <table className="w-full text-left font-mono text-xs">
                  <thead className="text-text-secondary border-b border-border-sutil">
                    <tr><th className="py-2 font-normal">NOME DO PROCESSO (AGRUPADO)</th><th className="py-2 font-normal text-right">RAM TOTAL (MB)</th></tr>
                  </thead>
                  <tbody className="text-text-primary">
                    {topProcesses.map((p, i) => (
                      <tr key={i} className="border-b border-border-sutil/50 hover:bg-surface-card transition-colors">
                        <td className="py-2 truncate max-w-[200px]">{p.name}</td>
                        <td className="py-2 text-right">{p.ramMb.toFixed(1)}</td>
                      </tr>
                    ))}
                    {topProcesses.length === 0 && <tr><td colSpan={2} className="py-4 text-center text-text-tertiary">Aguardando telemetria...</td></tr>}
                  </tbody>
               </table>
            </div>
          )}

          {/* TAB: INFO */}
          {activeTab === 'info' && (
            <div className="space-y-4 font-mono text-xs">
               <div className="flex justify-between border-b border-border-sutil py-2"><span className="text-text-tertiary">HOSTNAME</span><span className="text-text-primary">{asset.hostname}</span></div>
               <div className="flex justify-between border-b border-border-sutil py-2">
                 <span className="text-text-tertiary">HWID</span>
                 <span 
                   className="text-text-primary cursor-pointer hover:text-status-success flex items-center gap-2 transition-colors" 
                   title="Clique para copiar o HWID completo" 
                   onClick={() => { navigator.clipboard.writeText(asset.hwid); alert('HWID Copiado com sucesso!'); }}
                 >
                   {truncateHwid(asset.hwid)} <Copy size={12} />
                 </span>
               </div>
               <div className="flex justify-between border-b border-border-sutil py-2"><span className="text-text-tertiary">S.O.</span><span className="text-text-primary">{asset.osVersion}</span></div>
               <div className="flex justify-between border-b border-border-sutil py-2"><span className="text-text-tertiary">IP LOCAL</span><span className="text-text-primary">{asset.localIp || 'N/A'}</span></div>
               <div className="flex justify-between py-2"><span className="text-text-tertiary">MAC ADDRESS</span><span className="text-text-primary uppercase">{asset.macAddress || 'N/A'}</span></div>
            </div>
          )}

          {/* TAB: ACTIONS */}
          {activeTab === 'actions' && (
            <div className="flex flex-col gap-4">
              <h3 className="text-[10px] font-mono text-text-secondary tracking-widest mb-2">COMANDOS DO SISTEMA</h3>
              <button 
                onClick={() => handleCommand('shutdown')}
                className="p-3 bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500/20 text-xs font-mono tracking-widest uppercase transition-colors text-left flex items-center justify-between"
              >
                <span>Desligar Máquina (Shutdown)</span> <Power size={14} />
              </button>
              <button 
                onClick={() => handleCommand('reboot')}
                className="p-3 bg-orange-500/10 text-orange-500 border border-orange-500/20 hover:bg-orange-500/20 text-xs font-mono tracking-widest uppercase transition-colors text-left flex items-center justify-between"
              >
                <span>Reiniciar (Reboot)</span> <RefreshCw size={14} />
              </button>
              <button 
                onClick={() => handleCommand('suspend')}
                className="p-3 bg-blue-500/10 text-blue-500 border border-blue-500/20 hover:bg-blue-500/20 text-xs font-mono tracking-widest uppercase transition-colors text-left flex items-center justify-between"
              >
                <span>Suspender Máquina (Suspend)</span> <Lock size={14} />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
