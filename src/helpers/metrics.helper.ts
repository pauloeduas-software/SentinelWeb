import type { DiskMetrics, Telemetry } from '../types/telemetry.types';

const BYTES_IN_GB = 1024 ** 3;

// A coluna Json guarda o que o SentinelAgente mandou, em PascalCase: a lista
// `Disks`. A leitura mora AQUI — os componentes recebem número pronto para desenhar.

function readNumber(source: Record<string, unknown>, name: string): number {
  const value = Number(source[name]);
  return Number.isFinite(value) ? value : 0;
}

function readString(source: Record<string, unknown>, name: string): string | null {
  const value = source[name];
  return typeof value === 'string' && value ? value : null;
}

function asRecords(raw: unknown): Record<string, unknown>[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object');
}

function bytesToGb(bytes: string | number | undefined): number {
  const value = Number(bytes ?? 0);
  return Number.isFinite(value) ? value / BYTES_IN_GB : 0;
}

export function usagePercent(used: number, total: number): number {
  return total > 0 ? (used / total) * 100 : 0;
}

function parseDisks(raw: unknown): DiskMetrics[] {
  return asRecords(raw).map((disk, index) => ({
    name: readString(disk, 'Name') ?? `Disco ${index + 1}`,
    totalGb: readNumber(disk, 'TotalGb'),
    usedGb: readNumber(disk, 'UsedGb'),
  }));
}

/** Tudo que uma tela precisa de uma amostra, já calculado. */
interface TelemetrySnapshot {
  cpuUsage: number;
  ramTotalGb: number;
  ramUsedGb: number;
  ramPercent: number;
  disks: DiskMetrics[];
}

export function readSnapshot(telemetry: Telemetry | undefined): TelemetrySnapshot {
  const ramTotalGb = bytesToGb(telemetry?.ramTotal);
  const ramUsedGb = bytesToGb(telemetry?.ramUsed);
  // `mainDiskPercent` saiu daqui junto com o último leitor dele: era a barra DSK
  // do card da frota, que mostrava só o primeiro disco por falta de espaço. Quem
  // mostra disco agora mostra TODOS, com o `usagePercent` por linha.
  const disks = parseDisks(telemetry?.disks);

  return {
    cpuUsage: Number(telemetry?.cpuUsage ?? 0),
    ramTotalGb,
    ramUsedGb,
    ramPercent: usagePercent(ramUsedGb, ramTotalGb),
    disks,
  };
}
