import type { HandshakeData, ParsedAgentMessage, TelemetryData } from '../../shared/agent-protocol.types';
import { readBigInt, readField, readNumber, readString } from './payload.helper';

// Payload cru do agente → dado com uma grafia só. É aqui que a instabilidade do
// fio (PascalCase/camelCase, campo ausente, nome antigo) para: dali para dentro
// os use-cases trabalham com um formato fixo.

export function toHandshakeData(message: ParsedAgentMessage): HandshakeData {
  const { payload } = message;
  return {
    hwid: message.hwid,
    hostname: readString(payload, 'hostname') ?? 'desconhecido',
    osVersion: readString(payload, 'osVersion') ?? 'desconhecido',
    macAddress: readString(payload, 'macAddress'),
    localIp: readString(payload, 'localIp'),
    cpuModel: readString(payload, 'cpuModel'),
    installedSoftware: readField(payload, 'installedSoftware') ?? null,
  };
}

export function toTelemetryData(message: ParsedAgentMessage): TelemetryData {
  const { payload } = message;
  return {
    hwid: message.hwid,
    cpuUsage: readNumber(payload, 'cpuUsagePercentage', 'cpuUsage'),
    ramTotal: readBigInt(payload, 'ramTotalBytes', 'ramTotal'),
    ramUsed: readBigInt(payload, 'ramUsedBytes', 'ramUsed'),
    // `diskUsageBytes` é o nome antigo do campo de discos
    disks: readField(payload, 'disks', 'diskUsageBytes') ?? [],
    network: readField(payload, 'network') ?? { bytesReceived: 0, bytesSent: 0 },
    topProcesses: readField(payload, 'topProcesses') ?? [],
  };
}
