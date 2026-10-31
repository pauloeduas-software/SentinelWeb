// Contrato da conversa com o Agente Sentinel pelo WebSocket /agent-hub.
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
 * deles — e o que a máquina consegue coletar depende de permissão e de firmware,
 * então ausência é o caso comum, não a exceção. Campo obrigatório aqui
 * transformaria a máquina que coleta menos em erro de parser, e ela sumiria do
 * painel justamente por isso.
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
  /**
   * A lista de programas instalados, como o agente a manda.
   *
   * O PROTOCOLO AINDA ACEITA, E O SERVIDOR DESCARTA — o mesmo caso do
   * `loggedOnUser` abaixo. O campo continua no fio porque o agente em campo
   * continua mandando, e tirá-lo do tipo transformaria em erro de parser uma
   * mensagem que é válida. O que saiu foram as tabelas que o normalizavam.
   */
  installedSoftware: unknown;

  /** O número de série gravado no firmware. O sinal de 100 pontos da cascata. */
  biosSerial: string | null;
  /** O identificador que o firmware dá ao produto. Sobrevive à reinstalação. */
  systemUuid: string | null;
  /** O fabricante, como a própria máquina se declara. */
  manufacturer: string | null;
  /**
   * O modelo, como a própria máquina se declara.
   *
   * `hardwareModel`, e NUNCA `model`: é o D13 outra vez. `endpoint.model`
   * lê-se como a relação de catálogo do ativo (`Asset.model → AssetModel`), e o
   * dia em que alguém escrever `endpoint.model.name` esperando "Latitude 5440"
   * o compilador não ajudaria se o campo existisse com esse nome.
   */
  hardwareModel: string | null;
  /** O código do gabinete, como o firmware o declara: notebook, desktop, VM. */
  chassisType: string | null;
  /** Specs COLETADAS: moram no lado que descobre, não em `assets` (D16). */
  ramTotalBytes: bigint | null;
  diskTotalBytes: bigint | null;
  /**
   * A conta com sessão aberta na máquina no instante da coleta.
   *
   * O PROTOCOLO AINDA ACEITA, E O SERVIDOR DESCARTA. O campo continua no fio
   * porque o agente em campo continua mandando, e tirá-lo do tipo transformaria
   * em erro de parser uma mensagem que é válida. O que saiu foi a coluna.
   */
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
