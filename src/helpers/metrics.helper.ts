import type {
  DiskMetrics,
  NetworkMetrics,
  ProcessMetrics,
  Telemetry,
} from '../types/telemetry.types';

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

function bytesToGb(bytes: string | number | undefined): number {
  const value = Number(bytes ?? 0);
  return Number.isFinite(value) ? value / BYTES_IN_GB : 0;
}

export function usagePercent(used: number, total: number): number {
  return total > 0 ? (used / total) * 100 : 0;
}

function parseDisks(raw: unknown): DiskMetrics[] {
  return asRecords(raw).map(([key, disk], index) => ({
    // Em mapa, a chave é o nome do disco ("C:"); em lista, é o índice
    name: readString(disk, 'name') ?? (Number.isNaN(Number(key)) ? key : `Disco ${index + 1}`),
    totalGb: readNumber(disk, 'totalGb'),
    usedGb: readNumber(disk, 'usedGb'),
  }));
}

/** Zeros para a amostra sem rede nenhuma — todos os campos, não só dois. */
const SEM_REDE: NetworkMetrics = {
  bytesReceived: 0, bytesSent: 0,
  rxSpeedKbps: 0, txSpeedKbps: 0, totalRxGb: 0, totalTxGb: 0,
};

export function parseNetwork(raw: unknown): NetworkMetrics {
  const parsed = parseJsonField(raw);
  // O retorno de saída devolvia SÓ `bytesReceived` e `bytesSent`, e era por isso
  // que os quatro campos de velocidade eram opcionais no tipo: a amostra sem
  // coluna de rede saía incompleta, e cada tela pagava um `?? 0`. O caminho feliz
  // já preenchia os seis — agora os dois preenchem, e o tipo pode exigir.
  if (!parsed || typeof parsed !== 'object') return SEM_REDE;

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

// ═════════════════════════════════════════════════════════════════════════════
// AS UNIDADES DA REDE — uma base só, e ela é BYTE.
//
// O agente manda a velocidade em `RxSpeedKbps` (kilobit por segundo, que é como
// placa de rede e operadora falam) e os totais de duas formas: `BytesReceived`,
// o contador cru em bytes, e `TotalRxGb`, já convertido por ele. A tela mostrava
// os dois lados como vinham — "Kbps" ao lado de "Gb" — e o leitor somava bit
// com byte sem saber: um "Gb" minúsculo é gigaBIT, e o total era em gigaBYTE.
//
// Aqui a velocidade é convertida para BYTE por segundo e os totais ficam em
// byte, e o rótulo diz a unidade por extenso (kB/s, MB/s, MB, GB). Byte e não
// bit porque é a unidade do resto do painel — RAM, disco e processos — e a que
// a pessoa compara com o tamanho de um arquivo.
//
// A conversão assume o que o nome do campo diz: `Kbps` = 1.000 bit/s, a
// convenção de rede. Os totais em bytes usam 1.024³ por GB, como a RAM e o
// disco deste mesmo painel.
// ═════════════════════════════════════════════════════════════════════════════

/** Um número já formatado com a unidade que o acompanha. */
interface Medida {
  valor: string;
  unidade: string;
}

/** kbit/s do agente → byte por segundo, em kB/s ou MB/s. */
export function formatarTaxa(kbps: number): Medida {
  const kBs = kbps / 8;
  if (kBs >= 1000) return { valor: (kBs / 1000).toFixed(1), unidade: 'MB/s' };
  return { valor: kBs.toFixed(0), unidade: 'kB/s' };
}

/**
 * O volume de tráfego em BYTES.
 *
 * O contador cru (`bytesReceived`) quando o agente o manda; senão o total em
 * GB que ele mesmo informa, trazido para bytes. Os dois são a mesma grandeza
 * dita de dois jeitos, e o cru é o que não passou por arredondamento.
 */
export function volumeDeRede(bytes: number, gbInformado: number): number {
  return bytes > 0 ? bytes : gbInformado * BYTES_IN_GB;
}

/** Bytes → MB ou GB, conforme o tamanho. */
export function formatarVolume(bytes: number): Medida {
  const gb = bytes / BYTES_IN_GB;
  if (gb >= 1) return { valor: gb.toFixed(1), unidade: 'GB' };
  return { valor: (bytes / 1024 ** 2).toFixed(0), unidade: 'MB' };
}

function parseProcesses(raw: unknown): ProcessMetrics[] {
  return asRecords(raw).map(([, process]) => ({
    pid: readNumber(process, 'pid'),
    name: readString(process, 'name') ?? 'desconhecido',
    ramMb: readNumber(process, 'ramMb'),
  }));
}

/** Tudo que uma tela precisa de uma amostra, já calculado. */
interface TelemetrySnapshot {
  cpuUsage: number;
  ramTotalGb: number;
  ramUsedGb: number;
  ramPercent: number;
  disks: DiskMetrics[];
  network: NetworkMetrics;
  processes: ProcessMetrics[];
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
    network: parseNetwork(telemetry?.network),
    processes: parseProcesses(telemetry?.topProcesses),
  };
}
