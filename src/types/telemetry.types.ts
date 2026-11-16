export interface DiskMetrics {
  name: string;
  totalGb: number;
  usedGb: number;
}

export interface Telemetry {
  cpuUsage: number;
  /** Bytes. Chega como string: é BigInt no banco e BigInt não existe em JSON. */
  ramTotal: string;
  /** Bytes. Ver `ramTotal`. */
  ramUsed: string;
  /**
   * Coluna Json do Postgres, como o SentinelAgente a manda. A leitura passa
   * pelo parser de `helpers/metrics.helper.ts`.
   */
  disks?: unknown;
  timestamp: string;
}
