export interface DiskMetrics {
  name: string;
  totalGb: number;
  usedGb: number;
}

export interface NetworkMetrics {
  bytesReceived: number;
  bytesSent: number;
  rxSpeedKbps?: number;
  txSpeedKbps?: number;
  totalRxGb?: number;
  totalTxGb?: number;
}

export interface ProcessMetrics {
  pid: number;
  name: string;
  ramMb: number;
}

export interface Telemetry {
  cpuUsage: number;
  /** Bytes. Chega como string: é BigInt no banco e BigInt não existe em JSON. */
  ramTotal: string;
  /** Bytes. Ver `ramTotal`. */
  ramUsed: string;
  /**
   * Colunas Json do Postgres: o formato exato depende da versão do agente C#
   * que gravou a amostra. A leitura passa pelos parsers de
   * `pages/telemetria/helpers/metrics.helper.ts`, que toleram as variações.
   */
  disks?: unknown;
  network?: unknown;
  topProcesses?: unknown;
  timestamp: string;
}
