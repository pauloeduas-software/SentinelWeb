import type {
  DiskData, GpuData, HandshakeData, ParsedAgentMessage, TelemetryData,
} from '../../shared/agent-protocol.types';
import { readBigInt, readList, readNumber, readString } from './payload.helper';

// Payload cru do agente → dado do servidor. É aqui que a leitura do fio (campo
// ausente, tipo errado) para: dali para dentro os use-cases trabalham com um
// formato fixo.
//
// AS LISTAS TAMBÉM SE MONTAM AQUI, item por item: o `Gpus` e o `Disks` vão para
// colunas Json, e gravar a lista como veio poria no banco o que o agente antigo
// mandava (o fabricante e o PCI da placa) e o que um agente com bug inventasse,
// do tamanho que fosse. O item sem `Name` sai, e a lista tem teto.

/** Mais placas que isso numa máquina só é lixo, não inventário. */
const MAX_GPUS = 16;
/** Os pontos de montagem de uma máquina com muitos discos e partições cabem aqui. */
const MAX_DISKS = 64;

function toItems<T>(list: unknown[], max: number, toItem: (item: Record<string, unknown>) => T | null): T[] {
  return list
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object' && !Array.isArray(item))
    .map(toItem)
    .filter((item): item is T => item !== null)
    .slice(0, max);
}

function toGpu(item: Record<string, unknown>): GpuData | null {
  const name = readString(item, 'Name');
  if (!name) return null;
  const memory = readNumber(item, 'MemoryBytes');
  return { Name: name, MemoryBytes: memory > 0 ? memory : null };
}

function toDisk(item: Record<string, unknown>): DiskData | null {
  const name = readString(item, 'Name');
  if (!name) return null;
  return { Name: name, TotalGb: readNumber(item, 'TotalGb'), UsedGb: readNumber(item, 'UsedGb') };
}

// O `Gpus` ausente fica `undefined`, e não `[]`: o handshake que não trouxe a
// lista não apaga a que estava gravada.
function toGpus(payload: Record<string, unknown>): GpuData[] | undefined {
  const list = readList(payload, 'Gpus');
  return list && toItems(list, MAX_GPUS, toGpu);
}

export function toHandshakeData(message: ParsedAgentMessage): HandshakeData {
  const { payload } = message;
  return {
    hwid: message.hwid,
    hostname: readString(payload, 'Hostname') ?? 'desconhecido',
    osVersion: readString(payload, 'OsVersion') ?? 'desconhecido',
    macAddress: readString(payload, 'MacAddress'),
    localIp: readString(payload, 'LocalIp'),
    cpuModel: readString(payload, 'CpuModel'),

    // A IDENTIDADE. Ausência vira `null` e segue: o que a máquina não coleta
    // não é erro.
    biosSerial: readString(payload, 'BiosSerial'),
    systemUuid: readString(payload, 'SystemUuid'),
    manufacturer: readString(payload, 'Manufacturer'),
    hardwareModel: readString(payload, 'HardwareModel'),
    gpus: toGpus(payload),
    agentVersion: readString(payload, 'AgentVersion'),
  };
}

export function toTelemetryData(message: ParsedAgentMessage): TelemetryData {
  const { payload } = message;
  return {
    hwid: message.hwid,
    cpuUsage: readNumber(payload, 'CpuUsagePercentage'),
    ramTotal: readBigInt(payload, 'RamTotalBytes'),
    ramUsed: readBigInt(payload, 'RamUsedBytes'),
    disks: toItems(readList(payload, 'Disks') ?? [], MAX_DISKS, toDisk),
  };
}
