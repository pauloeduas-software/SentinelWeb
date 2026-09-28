import type { Telemetry } from './telemetry.types';

/**
 * O eixo do AGENTE — dois valores, e não os três que o TODO pedia.
 *
 * "Nunca visto pelo agente" é pergunta do ATIVO, não desta tabela: uma linha de
 * endpoint nasce de um handshake (docs/FASE-7-PLANO-ITAM.md, D98).
 *
 * União, e não `string`: com `string`, `endpoint.status === 'Online'` compila e
 * é sempre falso.
 */
export type AgentStatus = 'ONLINE' | 'OFFLINE';

/** Triagem do Shadow IT — máquina vista pelo agente e sem cadastro. */
export type ReviewState = 'UNREVIEWED' | 'ALLOWED' | 'BLOCKED';

/** Máquina descoberta pelo Agente Sentinel (C#) — o lado RMM. */
export interface Endpoint {
  id: string;
  hwid: string;
  hostname: string;
  osVersion: string;
  macAddress?: string | null;
  localIp?: string | null;
  cpuModel?: string | null;
  status: AgentStatus;
  lastSeen: string;

  /** A identidade coletada (F7). Tudo nulável: agente velho não manda. */
  biosSerial?: string | null;
  systemUuid?: string | null;
  manufacturer?: string | null;
  hardwareModel?: string | null;
  chassisType?: string | null;
  /** Vem como STRING: é `BigInt` no banco, e BigInt não tem JSON. */
  ramTotalBytes?: string | null;
  diskTotalBytes?: string | null;
  loggedOnUser?: string | null;

  /** O vínculo com o patrimônio (D45). Nulo = máquina sem cadastro. */
  assetId?: string | null;
  reviewState?: ReviewState;

  /** Só a amostra mais recente: a API devolve `take: 1`. */
  telemetries: Telemetry[];
}

export type AgentAction = 'shutdown' | 'reboot' | 'suspend';
