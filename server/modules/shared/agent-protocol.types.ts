// Contrato da conversa com o Agente Sentinel pelo WebSocket /agent-hub.
//
// O SentinelAgente serializa em PascalCase (`Hwid`, `CpuUsagePercentage`). O tipo
// "cru" abaixo descreve o que chega no fio; os "normalizados", o que os use-cases
// recebem (ver `agent/helpers/normalize-payload.helper.ts`).

export type AgentMessageType = 'Handshake' | 'Telemetry' | 'Ping';

/** Envelope cru, como o agente manda. */
export interface AgentEnvelope {
  Type?: string;
  Payload?: Record<string, unknown>;
}

/** Pacote que o servidor manda de volta para o agente executar. */
export interface AgentCommandPacket {
  Type: 'Command';
  Payload: { Action: string; CommandId: string };
}

/**
 * Identificação e inventário da máquina, enviados no Handshake.
 *
 * OS CAMPOS DE IDENTIDADE SÃO TODOS NULÁVEIS, e isso não é
 * frouxidão de tipo: o agente é um binário que vive FORA deste repositório, e o
 * rollout dele leva semanas. Durante todo esse tempo chega handshake sem nenhum
 * deles — e o que a máquina consegue coletar depende de permissão e de firmware,
 * então ausência é o caso comum, não a exceção. Campo obrigatório aqui
 * transformaria a máquina que coleta menos em erro de parser, e ela sumiria do
 * painel justamente por isso.
 *
 * Quem não manda serial simplesmente não se liga sozinho a um computador: o
 * vínculo automático é pela série única (docs/decisoes/reconciliacao.md, DC).
 *
 * O QUE CHEGA, e onde cada campo é gravado, está em `docs/referencia/agente.md`.
 * Valor de fábrica chega nulo.
 */
export interface HandshakeData {
  hwid: string;
  hostname: string;
  /** `NAME VERSION_ID` do os-release ("Ubuntu 24.04"), sem a versão pontual. O agente manda sempre. */
  osVersion: string;
  /** O da placa da rota padrão, como o sysfs dá: `aa:bb:cc:dd:ee:ff`, em minúsculas. */
  macAddress: string | null;
  localIp: string | null;
  cpuModel: string | null;

  /** O número de série gravado no firmware. A série única liga a máquina ao computador sozinha. */
  biosSerial: string | null;
  /** O identificador que o firmware dá ao produto. Sobrevive à reinstalação. */
  systemUuid: string | null;
  /** O fabricante, como a própria máquina se declara. */
  manufacturer: string | null;
  /**
   * O modelo, como a própria máquina se declara.
   *
   * `hardwareModel`, e NUNCA `model`: é o D13 outra vez. `endpoint.model`
   * lê-se como a relação de catálogo do ativo (`Asset.model → AssetModel`).
   */
  hardwareModel: string | null;
  /**
   * As placas de vídeo do `Gpus`, só com os campos que o agente
   * manda. `undefined` quando o agente não mandou: aí a lista gravada fica como estava.
   */
  gpus: GpuData[] | undefined;
  /** A versão do agente (`AgentVersion`). Nula no agente que não a manda. */
  agentVersion: string | null;
}

/**
 * Uma placa de vídeo, em PascalCase como chegou: é assim que ela vai para a
 * coluna Json e que o front a lê. `MemoryBytes` nulo quando o driver não diz.
 */
export type GpuData = {
  Name: string;
  MemoryBytes: number | null;
};

/**
 * Um disco da telemetria, em PascalCase pelo mesmo motivo da `GpuData`.
 *
 * `type` e não `interface`, as duas: só o `type` cabe no `InputJsonValue` do
 * Prisma, que pede assinatura de índice.
 */
export type DiskData = {
  Name: string;
  TotalGb: number;
  UsedGb: number;
};

/** Amostra de uso de recursos, enviada periodicamente. */
export interface TelemetryData {
  hwid: string;
  cpuUsage: number;
  ramTotal: bigint;
  ramUsed: bigint;
  disks: DiskData[];
}

/** Mensagem já identificada: o tipo e de qual máquina veio. */
export interface ParsedAgentMessage {
  type: AgentMessageType;
  hwid: string;
  payload: Record<string, unknown>;
}
