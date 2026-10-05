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

/**
 * Identificação e inventário da máquina, enviados no Handshake.
 *
 * OS OITO CAMPOS DE IDENTIDADE (F7, Etapa A) SÃO TODOS NULÁVEIS, e isso não é
 * frouxidão de tipo: o agente é um binário que vive FORA deste repositório, e o
 * rollout dele leva semanas. Durante todo esse tempo chega handshake sem nenhum
 * deles — agente velho em campo é a regra, não a exceção. Campo obrigatório aqui
 * transformaria a máquina mais antiga da frota em erro de parser, e ela sumiria
 * do painel justamente por ser velha.
 *
 * Quem não manda serial simplesmente não pontua por serial na cascata de
 * reconciliação (docs/historico/fase-07-convergencia-rmm-itam.md, D46).
 */
export interface HandshakeData {
  hwid: string;
  hostname: string;
  osVersion: string;
  macAddress: string | null;
  localIp: string | null;
  cpuModel: string | null;
  installedSoftware: unknown;

  /** `Win32_BIOS.SerialNumber` — o sinal de 100 pontos da cascata. */
  biosSerial: string | null;
  /** `Win32_ComputerSystemProduct.UUID`. */
  systemUuid: string | null;
  /** `Win32_ComputerSystem.Manufacturer`. */
  manufacturer: string | null;
  /**
   * `Win32_ComputerSystem.Model`.
   *
   * `hardwareModel`, e NUNCA `model`: é o D13 outra vez. `endpoint.model`
   * lê-se como a relação de catálogo do ativo (`Asset.model → AssetModel`), e o
   * dia em que alguém escrever `endpoint.model.name` esperando "Latitude 5440"
   * o compilador não ajudaria se o campo existisse com esse nome.
   */
  hardwareModel: string | null;
  /** `Win32_SystemEnclosure.ChassisTypes` — notebook, desktop, VM. */
  chassisType: string | null;
  /** Specs COLETADAS: moram no lado que descobre, não em `assets` (D16). */
  ramTotalBytes: bigint | null;
  diskTotalBytes: bigint | null;
  /** `Win32_ComputerSystem.UserName` — "DOMINIO\\ana.silva". A observação da Etapa E. */
  loggedOnUser: string | null;
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
