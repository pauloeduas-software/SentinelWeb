import type {
  DiskMetrics,
  NetworkMetrics,
  ProcessMetrics,
  Telemetry,
} from '../../../domain/shared/telemetry.types';

const BYTES_IN_GB = 1024 ** 3;

// As colunas Json guardam o que o agente gravou na época: ora objeto, ora texto
// JSON, ora nada. E os campos vêm ora em camelCase, ora em PascalCase. Toda essa
// tolerância mora AQUI — os componentes recebem número pronto para desenhar.

function parseJsonField(raw: unknown): unknown {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'string') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function readNumber(source: Record<string, unknown>, name: string): number {
  const pascal = name.charAt(0).toUpperCase() + name.slice(1);
  const value = Number(source[name] ?? source[pascal]);
  return Number.isFinite(value) ? value : 0;
}

function readString(source: Record<string, unknown>, name: string): string | null {
  const pascal = name.charAt(0).toUpperCase() + name.slice(1);
  const value = source[name] ?? source[pascal];
  return typeof value === 'string' && value ? value : null;
}

function asRecords(raw: unknown): [string, Record<string, unknown>][] {
  const parsed = parseJsonField(raw);
  if (!parsed || typeof parsed !== 'object') return [];
  // Cobre lista (`[{...}]`) e mapa (`{ "C:": {...} }`) com o mesmo caminho
  return Object.entries(parsed as Record<string, unknown>).filter(
    (entry): entry is [string, Record<string, unknown>] => !!entry[1] && typeof entry[1] === 'object',
  );
}

export function bytesToGb(bytes: string | number | undefined): number {
  const value = Number(bytes ?? 0);
  return Number.isFinite(value) ? value / BYTES_IN_GB : 0;
}

export function usagePercent(used: number, total: number): number {
  return total > 0 ? (used / total) * 100 : 0;
}

export function parseDisks(raw: unknown): DiskMetrics[] {
  return asRecords(raw).map(([key, disk], index) => ({
    // Em mapa, a chave é o nome do disco ("C:"); em lista, é o índice
    name: readString(disk, 'name') ?? (Number.isNaN(Number(key)) ? key : `Disco ${index + 1}`),
    totalGb: readNumber(disk, 'totalGb'),
    usedGb: readNumber(disk, 'usedGb'),
  }));
}

export function parseNetwork(raw: unknown): NetworkMetrics {
  const parsed = parseJsonField(raw);
  if (!parsed || typeof parsed !== 'object') return { bytesReceived: 0, bytesSent: 0 };

  const source = parsed as Record<string, unknown>;
  return {
    bytesReceived: readNumber(source, 'bytesReceived'),
    bytesSent: readNumber(source, 'bytesSent'),
    rxSpeedKbps: readNumber(source, 'rxSpeedKbps'),
    txSpeedKbps: readNumber(source, 'txSpeedKbps'),
    totalRxGb: readNumber(source, 'totalRxGb'),
    totalTxGb: readNumber(source, 'totalTxGb'),
  };
}

export function parseProcesses(raw: unknown): ProcessMetrics[] {
  return asRecords(raw).map(([, process]) => ({
    pid: readNumber(process, 'pid'),
    name: readString(process, 'name') ?? 'desconhecido',
    ramMb: readNumber(process, 'ramMb'),
  }));
}

/** Tudo que as telas de telemetria precisam de uma amostra, já calculado. */
export interface TelemetrySnapshot {
  cpuUsage: number;
  ramTotalGb: number;
  ramUsedGb: number;
  ramPercent: number;
  disks: DiskMetrics[];
  mainDiskPercent: number;
  network: NetworkMetrics;
  processes: ProcessMetrics[];
}

export function readSnapshot(telemetry: Telemetry | undefined): TelemetrySnapshot {
  const ramTotalGb = bytesToGb(telemetry?.ramTotal);
  const ramUsedGb = bytesToGb(telemetry?.ramUsed);
  const disks = parseDisks(telemetry?.disks);
  const mainDisk = disks[0];

  return {
    cpuUsage: Number(telemetry?.cpuUsage ?? 0),
    ramTotalGb,
    ramUsedGb,
    ramPercent: usagePercent(ramUsedGb, ramTotalGb),
    disks,
    mainDiskPercent: mainDisk ? usagePercent(mainDisk.usedGb, mainDisk.totalGb) : 0,
    network: parseNetwork(telemetry?.network),
    processes: parseProcesses(telemetry?.topProcesses),
  };
}
