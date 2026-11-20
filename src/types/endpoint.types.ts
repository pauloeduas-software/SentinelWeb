import type { Asset } from './asset.types';
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
 * A máquina que o SentinelAgente apresenta, como a lista de `/agentes` a lê —
 * `GET /api/endpoints`. A API devolve só estes campos (DA).
 */
export interface Endpoint {
  id: string;
  hostname: string;
  osVersion: string;
  /** A série do firmware, embaixo do nome da máquina. Nula quando o agente não coletou. */
  biosSerial: string | null;
  /** O IP da rede local, do último handshake: a coluna e a busca da lista (DJ). */
  localIp: string | null;
  status: AgentStatus;
  lastSeen: string;
  /** A versão do SentinelAgente, do último handshake. Nula no agente que não a manda. */
  agentVersion: string | null;
  /**
   * O ativo do vínculo, identificado: é a coluna Computador, e a linha leva à
   * ficha. `null` quando não há vínculo.
   */
  asset: { id: string; assetTag: string; name: string | null; serial: string | null } | null;
  dica: DicaDoVinculo | null;
  /** Por que a série não a ligou sozinha, na frase do servidor. */
  aviso: string | null;
}

/** O computador que o Vincular já abre escolhido: a mesma série, ou o mesmo nome (DC). */
export interface DicaDoVinculo { id: string; assetTag: string; sinal: 'SERIE' | 'NOME' }

/**
 * UMA máquina com a amostra de telemetria atual — `GET /api/endpoints/:id`: a
 * ficha da máquina (DF) e a aba Máquina do computador e do posto.
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
  agentVersion: string | null;
  status: AgentStatus;
  lastSeen: string;
  /** O computador vinculado, com o que a aba Computador da ficha mostra. */
  asset: {
    id: string;
    assetTag: string;
    serial: string | null;
    model: { name: string; manufacturer: { name: string }; category: { name: string } };
    status: { name: string; type: Asset['status']['type'] };
  } | null;
  /** Na máquina sem computador, como na linha da lista. */
  dica: DicaDoVinculo | null;
  aviso: string | null;
  /** Só a amostra mais recente: a API devolve `take: 1`. */
  telemetries: Telemetry[];
}

export type AgentAction = 'shutdown' | 'reboot' | 'suspend';
