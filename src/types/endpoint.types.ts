import type { Telemetry } from './telemetry.types';

/**
 * O eixo do AGENTE — dois valores, e não três.
 *
 * "Nunca visto pelo agente" é pergunta do ATIVO, não desta tabela: uma linha de
 * endpoint nasce de um handshake (docs/decisoes/reconciliacao.md, D98).
 *
 * União, e não `string`: com `string`, `endpoint.status === 'Online'` compila e
 * é sempre falso.
 */
type AgentStatus = 'ONLINE' | 'OFFLINE';

/**
 * Máquina descoberta pelo Agente Sentinel, como as listas de `/descobertas` a
 * leem — `GET /api/endpoints`. A API devolve só estes campos (DA).
 */
export interface Endpoint {
  id: string;
  hostname: string;
  osVersion: string;
  /** A série do firmware, embaixo do nome da máquina. Nula quando o agente não coletou. */
  biosSerial: string | null;
  status: AgentStatus;
  lastSeen: string;
  /**
   * O ativo do vínculo, identificado: é a coluna da lista de máquinas
   * vinculadas, e a etiqueta leva à ficha. `null` quando não há vínculo.
   */
  asset: { id: string; assetTag: string; name: string | null; serial: string | null } | null;
}

/**
 * UMA máquina com a amostra de telemetria atual — `GET /api/endpoints/:id`, a
 * aba Máquina do computador e do posto.
 */
export interface EndpointComTelemetria {
  id: string;
  hwid: string;
  hostname: string;
  osVersion: string;
  /** A série, o fabricante e o modelo como a própria máquina se declara. */
  biosSerial: string | null;
  manufacturer: string | null;
  hardwareModel: string | null;
  /** As placas de vídeo, como o agente as manda: lidas por `lerPlacasDeVideo`. */
  gpus: unknown;
  cpuModel: string | null;
  localIp: string | null;
  macAddress: string | null;
  status: AgentStatus;
  lastSeen: string;
  /** Só a amostra mais recente: a API devolve `take: 1`. */
  telemetries: Telemetry[];
}

export type AgentAction = 'shutdown' | 'reboot' | 'suspend';
