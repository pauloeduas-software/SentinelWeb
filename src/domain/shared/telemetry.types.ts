export interface DiskMetrics {
  name: string;
  totalGb: number;
  usedGb: number;
}

/**
 * As medidas de rede de uma amostra, já em número.
 *
 * NENHUM CAMPO É OPCIONAL, e os quatro últimos já foram: o `parseNetwork`
 * (`pages/helpers/metrics.helper.ts`) preenche os seis em todo caminho — é ele
 * que absorve a coluna Json ausente, o texto JSON no lugar do objeto e o campo
 * em PascalCase, devolvendo `0` quando não há leitura. Com o `?`, cada tela
 * pagava um `?? 0` que nunca acontecia, e o compilador cobrava a dúvida de quem
 * já tinha a resposta.
 */
export interface NetworkMetrics {
  bytesReceived: number;
  bytesSent: number;
  rxSpeedKbps: number;
  txSpeedKbps: number;
  totalRxGb: number;
  totalTxGb: number;
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
   * Colunas Json do Postgres: o formato exato depende da versão do agente
   * que gravou a amostra. A leitura passa pelos parsers de
   * `pages/helpers/metrics.helper.ts`, que toleram as variações.
   */
  disks?: unknown;
  network?: unknown;
  topProcesses?: unknown;
  timestamp: string;
}
