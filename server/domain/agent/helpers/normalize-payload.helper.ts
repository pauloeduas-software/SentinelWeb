import type { HandshakeData, ParsedAgentMessage, TelemetryData } from '../../shared/agent-protocol.types';
import { readBigInt, readField, readNumber, readOptionalBigInt, readString } from './payload.helper';

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

    // A IDENTIDADE (F7). Os sinônimos são os nomes que o agente C# usa hoje e os
    // que ele usou antes — a mesma tabela que já resolvia PascalCase × camelCase.
    // Ausência vira `null` e segue: agente velho não é erro.
    biosSerial: readString(payload, 'biosSerial', 'serialNumber'),
    systemUuid: readString(payload, 'systemUuid', 'uuid'),
    manufacturer: readString(payload, 'manufacturer'),
    hardwareModel: readString(payload, 'hardwareModel', 'model'),
    chassisType: readString(payload, 'chassisType', 'chassis'),
    ramTotalBytes: readOptionalBigInt(payload, 'ramTotalBytes', 'totalPhysicalMemory'),
    diskTotalBytes: readOptionalBigInt(payload, 'diskTotalBytes'),
    loggedOnUser: readString(payload, 'loggedOnUser', 'userName'),
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
