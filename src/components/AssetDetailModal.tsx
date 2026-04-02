import { useState, useEffect, useRef } from 'react';
import {
  X,
  Cpu,
  MemoryStick,
  HardDrive,
  Activity,
  Globe,
  Fingerprint,
  Clock,
  Monitor,
  Wifi,
  WifiOff,
  History,
  TrendingUp,
  TrendingDown,
  Minus,
  Shield,
  Eye,
  AlertTriangle,
  CheckCircle,
  Info,
  ChevronRight,
  Server,
  Zap,
  Database,
  RefreshCw,
} from 'lucide-react';

// ─── Interfaces ───────────────────────────────────────────────

interface Telemetry {
  cpuUsage: number;
  ramTotal: string;
  ramUsed: string;
  disks: Record<string, { TotalGb?: number; UsedGb?: number; totalGb?: number; usedGb?: number }>;
  timestamp: string;
}

interface Asset {
  id: string;
  hwid: string;
  hostname: string;
  osVersion: string;
  macAddress?: string;
  localIp?: string;
  installedSoftware?: string[];
  status: string;
  telemetries: Telemetry[];
}

interface AssetDetailModalProps {
  asset: Asset | null;
  isOpen: boolean;
  onClose: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────

function getMetricColor(value: number) {
  if (value < 60) return {
    bar: 'from-emerald-500 to-teal-400',
    text: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/20',
    glow: '0 0 20px rgba(16,185,129,0.2)',
    hex: '#10b981',
  };
  if (value < 80) return {
    bar: 'from-amber-500 to-yellow-400',
    text: 'text-amber-400',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/20',
    glow: '0 0 20px rgba(245,158,11,0.2)',
    hex: '#f59e0b',
  };
  return {
    bar: 'from-red-500 to-rose-400',
    text: 'text-red-400',
    bg: 'bg-red-500/10',
    border: 'border-red-500/20',
    glow: '0 0 20px rgba(239,68,68,0.2)',
    hex: '#ef4444',
  };
}

function formatTimeAgo(timestamp: string) {
  const diff = (Date.now() - new Date(timestamp).getTime()) / 1000;
  if (diff < 60) return `há ${Math.floor(diff)}s`;
  if (diff < 3600) return `há ${Math.floor(diff / 60)}min`;
  if (diff < 86400) return `há ${Math.floor(diff / 3600)}h`;
  return `há ${Math.floor(diff / 86400)}d`;
}

// ─── MiniSparkline ─────────────────────────────────────────────

const MiniSparkline = ({ data, color }: { data: number[]; color: string }) => {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data);
  const range = max - min || 1;
  const width = 80;
  const height = 28;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * height * 0.85 - height * 0.07;
    return `${x},${y}`;
  });
  const polyline = pts.join(' ');
  const fillPath = `M${pts[0]} ${pts.slice(1).map(p => `L${p}`).join(' ')} L${width},${height} L0,${height} Z`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      <defs>
        <linearGradient id={`sparkfill-${color}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={fillPath} fill={`url(#sparkfill-${color})`} />
      <polyline points={polyline} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

// ─── RadialGauge ───────────────────────────────────────────────

const RadialGauge = ({ value, label, icon: Icon, iconColor }: { value: number; label: string; icon: any; iconColor: string }) => {
  const colors = getMetricColor(value);
  const radius = 36;
  const startAngle = 135;
  const endAngle = 45;
  const polarToCartesian = (cx: number, cy: number, r: number, angle: number) => {
    const rad = ((angle - 90) * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  };
  const start = polarToCartesian(48, 48, radius, startAngle);
  const end = polarToCartesian(48, 48, radius, endAngle);
  const pct = (value / 100) * 270;
  const valueEnd = polarToCartesian(48, 48, radius, startAngle + pct);
  const largeArc = pct > 180 ? 1 : 0;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: 96, height: 80 }}>
        <svg width="96" height="96" viewBox="0 0 96 96" className="absolute top-0 left-0">
          {/* Track */}
          <path
            d={`M ${start.x} ${start.y} A ${radius} ${radius} 0 1 1 ${end.x} ${end.y}`}
            fill="none"
            stroke="rgba(255,255,255,0.05)"
            strokeWidth="5"
            strokeLinecap="round"
          />
          {/* Value arc */}
          {value > 0 && (
            <path
              d={`M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 1 ${valueEnd.x} ${valueEnd.y}`}
              fill="none"
              stroke={colors.hex}
              strokeWidth="5"
              strokeLinecap="round"
              style={{ filter: `drop-shadow(0 0 4px ${colors.hex}88)` }}
            />
          )}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center pt-1">
          <Icon size={13} className={iconColor} />
          <span className={`text-lg font-black tabular-nums leading-none mt-0.5 ${colors.text}`}>
            {value}<span className="text-[10px] font-bold opacity-70">%</span>
          </span>
        </div>
      </div>
      <span className="text-[10px] font-black uppercase tracking-widest text-gray-600">{label}</span>
    </div>
  );
};

// ─── AuditEvent (mock) ─────────────────────────────────────────

interface AuditEvent {
  id: string;
  type: 'online' | 'offline' | 'warning' | 'info' | 'command';
  message: string;
  timestamp: Date;
  detail?: string;
  user?: string;
}

function generateAuditEvents(asset: Asset): AuditEvent[] {
  const now = new Date();
  const events: AuditEvent[] = [];
  const base = [
    { type: 'online' as const, message: 'Agente conectado', detail: `IP: ${asset.localIp || '—'}` },
    { type: 'info' as const, message: 'Telemetria sincronizada', detail: 'CPU, RAM e discos coletados' },
    { type: 'info' as const, message: 'Inventário de software atualizado', detail: `${(asset.installedSoftware?.length || 0)} softwares detectados` },
    { type: 'warning' as const, message: 'Uso de memória elevado', detail: 'RAM > 80% por mais de 5 minutos', user: 'Sistema' },
    { type: 'info' as const, message: 'Verificação de integridade', detail: 'Hash do agente validado com sucesso' },
    { type: 'command' as const, message: 'Comando recebido', detail: 'PING — resposta em 4ms', user: 'Sistema' },
    { type: 'info' as const, message: 'Heartbeat registrado', detail: 'Conexão estável' },
    { type: 'online' as const, message: 'Agente reconectado', detail: 'Reconexão automática' },
  ];
  base.forEach((e, i) => {
    events.push({
      id: `evt-${i}`,
      ...e,
      timestamp: new Date(now.getTime() - i * 8 * 60 * 1000),
    });
  });
  return events;
}

const auditTypeConfig = {
  online:   { icon: Wifi,         color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', label: 'Online' },
  offline:  { icon: WifiOff,      color: 'text-red-400',     bg: 'bg-red-500/10',     border: 'border-red-500/20',     label: 'Offline' },
  warning:  { icon: AlertTriangle,color: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/20',   label: 'Alerta' },
  info:     { icon: Info,          color: 'text-blue-400',    bg: 'bg-blue-500/10',    border: 'border-blue-500/20',    label: 'Info' },
  command:  { icon: Zap,           color: 'text-purple-400',  bg: 'bg-purple-500/10',  border: 'border-purple-500/20',  label: 'Comando' },
};

// ─── Main Modal ────────────────────────────────────────────────

export default function AssetDetailModal({ asset, isOpen, onClose }: AssetDetailModalProps) {
  const [activeTab, setActiveTab] = useState<'telemetry' | 'audit'>('telemetry');
  const [auditFilter, setAuditFilter] = useState<string>('all');
  const [animateIn, setAnimateIn] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => setAnimateIn(true), 10);
      setActiveTab('telemetry');
    } else {
      setAnimateIn(false);
    }
  }, [isOpen]);

  if (!isOpen || !asset) return null;

  const telemetry = asset.telemetries[0];
  const isOnline = asset.status === 'ONLINE';

  // RAM
  const ramTotalGB = telemetry ? Number(telemetry.ramTotal) / 1024 / 1024 / 1024 : 0;
  const ramUsedGB  = telemetry ? Number(telemetry.ramUsed)  / 1024 / 1024 / 1024 : 0;
  const ramPercent = ramTotalGB > 0 ? Math.round((ramUsedGB / ramTotalGB) * 100) : 0;

  // Disk
  const diskEntries = Object.entries(telemetry?.disks || {});
  const mainDisk    = diskEntries[0] || ['Disk', { totalGb: 0, usedGb: 0 }];
  const mainDiskData = mainDisk[1] as any;
  const mainTotal   = mainDiskData?.totalGb ?? mainDiskData?.TotalGb ?? 0;
  const mainUsed    = mainDiskData?.usedGb ?? mainDiskData?.UsedGb ?? 0;
  const diskPercent = mainTotal > 0 ? Math.round((mainUsed / mainTotal) * 100) : 0;

  // History sparklines (mock based on current)
  const cpuVal = telemetry?.cpuUsage || 0;
  const cpuHistory = Array.from({ length: 12 }, (_, i) =>
    Math.max(0, Math.min(100, cpuVal + (Math.sin(i * 0.9) * 12) + (Math.random() * 8 - 4)))
  );
  const ramHistory = Array.from({ length: 12 }, (_, i) =>
    Math.max(0, Math.min(100, ramPercent + (Math.cos(i * 0.7) * 8) + (Math.random() * 5 - 2.5)))
  );
  const diskHistory = Array.from({ length: 12 }, (_, i) =>
    Math.max(0, Math.min(100, diskPercent + (Math.sin(i * 0.4) * 3)))
  );

  const cpuColors  = getMetricColor(cpuVal);
  const ramColors  = getMetricColor(ramPercent);
  const diskColors = getMetricColor(diskPercent);

  const auditEvents = generateAuditEvents(asset);
  const auditFiltered = auditFilter === 'all'
    ? auditEvents
    : auditEvents.filter(e => e.type === auditFilter);

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) onClose();
  };

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{
        background: animateIn ? 'rgba(8,12,18,0.85)' : 'rgba(8,12,18,0)',
        backdropFilter: animateIn ? 'blur(8px)' : 'blur(0px)',
        transition: 'background 0.3s ease, backdrop-filter 0.3s ease',
      }}
    >
      {/* Glow blob */}
      <div
        className="absolute pointer-events-none rounded-full blur-3xl"
        style={{
          width: 600, height: 400,
          background: isOnline ? 'radial-gradient(circle, rgba(59,130,246,0.08) 0%, transparent 70%)' : 'radial-gradient(circle, rgba(239,68,68,0.05) 0%, transparent 70%)',
          top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
        }}
      />

      {/* Modal panel */}
      <div
        className="relative w-full sm:max-w-2xl flex flex-col overflow-hidden"
        style={{
          maxHeight: '95vh',
          borderRadius: '20px 20px 20px 20px',
          background: 'linear-gradient(160deg, #0f1622 0%, #0a1018 100%)',
          border: '1px solid rgba(255,255,255,0.07)',
          boxShadow: `0 32px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04), ${isOnline ? '0 0 60px rgba(59,130,246,0.08)' : '0 0 60px rgba(239,68,68,0.05)'}`,
          transform: animateIn ? 'translateY(0) scale(1)' : 'translateY(20px) scale(0.98)',
          opacity: animateIn ? 1 : 0,
          transition: 'transform 0.35s cubic-bezier(0.22,1,0.36,1), opacity 0.3s ease',
        }}
      >
        {/* Top accent gradient line */}
        <div
          className="h-px w-full flex-shrink-0"
          style={{
            background: isOnline
              ? 'linear-gradient(90deg, transparent 0%, rgba(59,130,246,0.6) 30%, rgba(99,102,241,0.4) 70%, transparent 100%)'
              : 'linear-gradient(90deg, transparent 0%, rgba(239,68,68,0.4) 50%, transparent 100%)',
          }}
        />

        {/* ── Header ── */}
        <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b border-white/[0.05]">
          <div className="flex items-center gap-3 min-w-0">
            {/* Status dot + icon */}
            <div
              className="relative h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{
                background: isOnline
                  ? 'linear-gradient(135deg, rgba(59,130,246,0.15), rgba(59,130,246,0.05))'
                  : 'rgba(255,255,255,0.04)',
                border: isOnline ? '1px solid rgba(59,130,246,0.2)' : '1px solid rgba(255,255,255,0.06)',
              }}
            >
              <Monitor size={18} className={isOnline ? 'text-blue-400' : 'text-gray-600'} />
              <span
                className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[#0a1018]"
                style={{ background: isOnline ? '#10b981' : '#6b7280' }}
              />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-black text-white tracking-tight truncate">{asset.hostname}</h2>
              <p className="text-[10px] font-mono text-gray-600 truncate mt-0.5">{asset.hwid.substring(0, 20)}…</p>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-shrink-0">
            {/* Status badge */}
            <div
              className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest"
              style={{
                background: isOnline ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
                border: isOnline ? '1px solid rgba(16,185,129,0.2)' : '1px solid rgba(239,68,68,0.2)',
                color: isOnline ? '#10b981' : '#ef4444',
              }}
            >
              <span className="relative flex h-1.5 w-1.5">
                {isOnline && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />}
                <span className="relative inline-flex rounded-full h-1.5 w-1.5" style={{ background: isOnline ? '#10b981' : '#ef4444' }} />
              </span>
              {isOnline ? 'Online' : 'Offline'}
            </div>

            {/* Close */}
            <button
              onClick={onClose}
              className="h-8 w-8 rounded-full flex items-center justify-center text-gray-600 hover:text-white transition-all"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* ── Tabs ── */}
        <div className="flex-shrink-0 flex border-b border-white/[0.05] px-6 bg-white/[0.01]">
          {(['telemetry', 'audit'] as const).map((tab) => {
            const active = activeTab === tab;
            const labels = { telemetry: 'Telemetria', audit: 'Auditoria' };
            const icons  = { telemetry: Activity, audit: Shield };
            const TabIcon = icons[tab];
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className="relative flex items-center gap-2 px-1 py-3.5 mr-6 text-[11px] font-black uppercase tracking-widest transition-all"
                style={{ color: active ? '#3b82f6' : 'rgba(255,255,255,0.3)' }}
              >
                <TabIcon size={12} />
                {labels[tab]}
                {active && (
                  <span
                    className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full"
                    style={{ background: 'linear-gradient(90deg, #3b82f6, #6366f1)' }}
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* ── Content ── */}
        <div className="flex-1 overflow-y-auto">

          {/* ══ TELEMETRY TAB ══ */}
          {activeTab === 'telemetry' && (
            <div className="p-5 space-y-4">

              {/* Gauges row */}
              <div className="rounded-2xl p-5" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div className="flex items-center gap-2 mb-5">
                  <TrendingUp size={12} className="text-blue-500" />
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-600">Performance em Tempo Real</span>
                  {telemetry && (
                    <span className="ml-auto flex items-center gap-1.5 text-[9px] font-mono text-gray-700">
                      <RefreshCw size={8} />
                      {formatTimeAgo(telemetry.timestamp)}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <RadialGauge value={cpuVal}      label="CPU"    icon={Cpu}         iconColor="text-amber-400" />
                  <RadialGauge value={ramPercent}  label="Memória" icon={MemoryStick} iconColor="text-blue-400" />
                  <RadialGauge value={diskPercent} label="Disco"  icon={HardDrive}   iconColor="text-emerald-400" />
                </div>

                {/* Sparklines row */}
                <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-white/[0.04]">
                  {[
                    { label: 'CPU', history: cpuHistory, colors: cpuColors },
                    { label: 'RAM', history: ramHistory, colors: ramColors },
                    { label: 'Disco', history: diskHistory, colors: diskColors },
                  ].map(({ label, history, colors }) => {
                    const last = history[history.length - 1];
                    const prev = history[history.length - 2];
                    const diff = last - prev;
                    return (
                      <div key={label} className="flex flex-col items-center gap-1">
                        <div className="flex items-center gap-1 text-[9px] text-gray-700">
                          {diff > 1 ? <TrendingUp size={9} className="text-red-400" /> : diff < -1 ? <TrendingDown size={9} className="text-emerald-400" /> : <Minus size={9} />}
                          <span>{diff > 0 ? '+' : ''}{diff.toFixed(1)}%</span>
                        </div>
                        <MiniSparkline data={history} color={colors.hex} />
                        <span className="text-[9px] text-gray-700 font-mono uppercase tracking-widest">{label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* RAM detail */}
              <div className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <MemoryStick size={13} className="text-blue-400" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">Memória RAM</span>
                  </div>
                  <span className={`text-sm font-black tabular-nums ${ramColors.text}`}>{ramPercent}%</span>
                </div>
                <div className="w-full rounded-full overflow-hidden" style={{ height: 6, background: 'rgba(255,255,255,0.05)' }}>
                  <div
                    className={`h-full rounded-full bg-gradient-to-r ${ramColors.bar} transition-all duration-1000`}
                    style={{ width: `${ramPercent}%`, boxShadow: `0 0 12px ${ramColors.hex}66` }}
                  />
                </div>
                <div className="flex justify-between mt-2 text-[10px] font-mono text-gray-600">
                  <span>{ramUsedGB.toFixed(1)} GB usados</span>
                  <span>{ramTotalGB.toFixed(1)} GB total</span>
                </div>
              </div>

              {/* Disks */}
              {diskEntries.length > 0 && (
                <div className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <div className="flex items-center gap-2 mb-4">
                    <Database size={13} className="text-emerald-400" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">Armazenamento</span>
                  </div>
                  <div className="space-y-4">
                    {diskEntries.map(([name, data]: [string, any]) => {
                      const total = data?.totalGb ?? data?.TotalGb ?? 0;
                      const used  = data?.usedGb  ?? data?.UsedGb  ?? 0;
                      const free  = total - used;
                      const pct   = total > 0 ? Math.round((used / total) * 100) : 0;
                      const c     = getMetricColor(pct);
                      return (
                        <div key={name}>
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <div className="h-6 w-6 rounded-lg flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                                <HardDrive size={11} className="text-gray-600" />
                              </div>
                              <span className="text-xs font-bold text-gray-400">{name}</span>
                            </div>
                            <span className={`text-sm font-black tabular-nums ${c.text}`}>{pct}%</span>
                          </div>
                          <div className="w-full rounded-full overflow-hidden" style={{ height: 5, background: 'rgba(255,255,255,0.05)' }}>
                            <div
                              className={`h-full rounded-full bg-gradient-to-r ${c.bar} transition-all duration-1000`}
                              style={{ width: `${pct}%`, boxShadow: `0 0 10px ${c.hex}55` }}
                            />
                          </div>
                          <div className="flex justify-between mt-1.5 text-[10px] font-mono text-gray-700">
                            <span>{used.toFixed(1)} GB usados</span>
                            <span className="text-gray-800">{free.toFixed(1)} GB livres · {total.toFixed(1)} GB</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* System info */}
              <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.05)' }}>
                <div className="px-4 py-3 flex items-center gap-2" style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <Server size={12} className="text-gray-500" />
                  <span className="text-[10px] font-black uppercase tracking-widest text-gray-600">Informações do Sistema</span>
                </div>
                <div className="grid grid-cols-2 divide-x divide-white/[0.04]">
                  {[
                    { icon: Globe,       label: 'IP Local',       value: asset.localIp || '—' },
                    { icon: Fingerprint, label: 'Endereço MAC',   value: asset.macAddress?.toUpperCase() || '—' },
                    { icon: Monitor,     label: 'Sistema Operac.', value: asset.osVersion || '—' },
                    { icon: Shield,      label: 'HWID',           value: asset.hwid.substring(0, 14) + '…' },
                  ].map(({ icon: Icon, label, value }, idx) => (
                    <div
                      key={label}
                      className="flex items-center gap-3 px-4 py-3"
                      style={{ borderBottom: idx < 2 ? '1px solid rgba(255,255,255,0.04)' : undefined }}
                    >
                      <div className="h-7 w-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <Icon size={12} className="text-gray-600" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[9px] font-black uppercase tracking-widest text-gray-700">{label}</p>
                        <p className="text-[11px] font-mono font-medium text-gray-300 truncate mt-0.5">{value}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ══ AUDIT TAB ══ */}
          {activeTab === 'audit' && (
            <div className="flex flex-col h-full">

              {/* Audit summary chips */}
              <div className="flex-shrink-0 flex items-center gap-2 px-5 py-4 border-b border-white/[0.04] flex-wrap">
                {[
                  { key: 'all',     label: 'Todos',   count: auditEvents.length },
                  { key: 'warning', label: 'Alertas', count: auditEvents.filter(e => e.type === 'warning').length },
                  { key: 'command', label: 'Comandos',count: auditEvents.filter(e => e.type === 'command').length },
                  { key: 'online',  label: 'Status',  count: auditEvents.filter(e => e.type === 'online' || e.type === 'offline').length },
                  { key: 'info',    label: 'Sistema', count: auditEvents.filter(e => e.type === 'info').length },
                ].map(({ key, label, count }) => {
                  const active = auditFilter === key;
                  return (
                    <button
                      key={key}
                      onClick={() => setAuditFilter(key)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider transition-all"
                      style={{
                        background: active ? 'rgba(59,130,246,0.12)' : 'rgba(255,255,255,0.03)',
                        border: active ? '1px solid rgba(59,130,246,0.3)' : '1px solid rgba(255,255,255,0.06)',
                        color: active ? '#3b82f6' : 'rgba(255,255,255,0.3)',
                      }}
                    >
                      {label}
                      <span
                        className="text-[9px] font-black rounded-full px-1.5 py-0.5 tabular-nums"
                        style={{ background: active ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.06)' }}
                      >
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Events list */}
              <div className="flex-1 overflow-y-auto p-4">
                {auditFiltered.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="h-14 w-14 rounded-2xl flex items-center justify-center mb-4" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                      <History size={24} className="text-gray-700" />
                    </div>
                    <p className="text-sm font-medium text-gray-600">Nenhum evento encontrado</p>
                  </div>
                ) : (
                  <div className="relative">
                    {/* Timeline line */}
                    <div className="absolute left-[23px] top-0 bottom-0 w-px" style={{ background: 'rgba(255,255,255,0.04)' }} />
                    <div className="space-y-1">
                      {auditFiltered.map((event, idx) => {
                        const cfg = auditTypeConfig[event.type];
                        const EventIcon = cfg.icon;
                        return (
                          <div
                            key={event.id}
                            className="relative flex gap-4 group"
                            style={{ animationDelay: `${idx * 40}ms` }}
                          >
                            {/* Icon dot */}
                            <div
                              className={`relative z-10 h-[46px] flex items-center flex-shrink-0`}
                            >
                              <div
                                className={`h-[30px] w-[30px] rounded-full flex items-center justify-center transition-all group-hover:scale-110`}
                                style={{ background: `rgba(255,255,255,0.04)`, border: `1px solid rgba(255,255,255,0.07)` }}
                              >
                                <EventIcon size={13} className={cfg.color} />
                              </div>
                            </div>

                            {/* Event card */}
                            <div
                              className="flex-1 rounded-xl px-4 py-3 mb-1 transition-all group-hover:bg-white/[0.025] cursor-default"
                              style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.04)' }}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span
                                      className="text-[9px] font-black uppercase tracking-widest rounded-full px-2 py-0.5"
                                      style={{
                                        background: `rgba(255,255,255,0.04)`,
                                        border: `1px solid rgba(255,255,255,0.07)`,
                                        color: cfg.color.replace('text-', '').replace('-400', ''),
                                      }}
                                    >
                                      <span className={cfg.color}>{cfg.label}</span>
                                    </span>
                                    <p className="text-xs font-semibold text-gray-200">{event.message}</p>
                                  </div>
                                  {event.detail && (
                                    <p className="text-[11px] text-gray-600 mt-1 font-mono">{event.detail}</p>
                                  )}
                                  {event.user && (
                                    <p className="text-[10px] text-gray-700 mt-1">por <span className="text-gray-500">{event.user}</span></p>
                                  )}
                                </div>
                                <div className="flex-shrink-0 text-right">
                                  <p className="text-[10px] font-mono text-gray-700 whitespace-nowrap">
                                    {formatTimeAgo(event.timestamp.toISOString())}
                                  </p>
                                  <p className="text-[9px] font-mono text-gray-800 mt-0.5 whitespace-nowrap">
                                    {event.timestamp.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                  </p>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Audit footer */}
              <div className="flex-shrink-0 border-t border-white/[0.05] px-5 py-3 flex items-center justify-between" style={{ background: 'rgba(255,255,255,0.015)' }}>
                <div className="flex items-center gap-2">
                  <CheckCircle size={11} className="text-emerald-500" />
                  <span className="text-[10px] font-mono text-gray-700 uppercase tracking-widest">Auditoria ativa</span>
                </div>
                <span className="text-[10px] font-mono text-gray-700">
                  {auditEvents.length} eventos registrados
                </span>
              </div>
            </div>
          )}
        </div>

        {/* ── Footer bar ── */}
        <div
          className="flex-shrink-0 flex items-center justify-between gap-4 px-6 py-3 border-t border-white/[0.05]"
          style={{ background: 'rgba(255,255,255,0.015)' }}
        >
          <div className="flex items-center gap-1.5 text-[10px] font-mono text-gray-700">
            <Eye size={10} />
            <span>HWID: {asset.hwid.substring(0, 12)}…</span>
          </div>
          <div className="flex items-center gap-2">
            {telemetry && (
              <div className="flex items-center gap-1.5 text-[10px] font-mono text-gray-700">
                <Clock size={9} />
                <span>Sync {formatTimeAgo(telemetry.timestamp)}</span>
              </div>
            )}
            <ChevronRight size={12} className="text-gray-800" />
          </div>
        </div>
      </div>
    </div>
  );
}
