// Contrato da conversa com o Agente Sentinel (C#) pelo WebSocket /agent-hub.
//
// O agente serializa em PascalCase (`Hwid`, `CpuUsagePercentage`); versões mais
// antigas mandam camelCase. Os tipos "crus" abaixo descrevem o que chega no fio;
// os tipos "normalizados" descrevem o que os use-cases recebem, já numa grafia
// só (ver `agent/helpers/parse-agent-message.helper.ts`).

export type AgentMessageType = 'Handshake' | 'Telemetry' | 'Ping';

/** Envelope cru, como o agente manda. */
export interface AgentEnvelope {
  Type?: string;
  type?: string;
  Payload?: Record<string, unknown>;
  payload?: Record<string, unknown>;
}

/** Pacote que o servidor manda de volta para o agente executar. */
export interface AgentCommandPacket {
  Type: 'Command';
  Payload: { Action: string; CommandId: string };
}

/** Identificação e inventário da máquina, enviados no Handshake. */
export interface HandshakeData {
  hwid: string;
  hostname: string;
  osVersion: string;
  macAddress: string | null;
  localIp: string | null;
  cpuModel: string | null;
  installedSoftware: unknown;
}

/** Amostra de uso de recursos, enviada periodicamente. */
export interface TelemetryData {
  hwid: string;
  cpuUsage: number;
  ramTotal: bigint;
  ramUsed: bigint;
  disks: unknown;
  network: unknown;
  topProcesses: unknown;
}

/** Mensagem já identificada: o tipo e de qual máquina veio. */
export interface ParsedAgentMessage {
  type: AgentMessageType;
  hwid: string;
  payload: Record<string, unknown>;
}
