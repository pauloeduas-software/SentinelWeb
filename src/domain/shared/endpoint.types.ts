import type { Telemetry } from './telemetry.types';

/** Máquina descoberta pelo Agente Sentinel (C#) — o lado RMM. */
export interface Endpoint {
  id: string;
  hwid: string;
  hostname: string;
  osVersion: string;
  macAddress?: string | null;
  localIp?: string | null;
  cpuModel?: string | null;
  status: string;
  lastSeen: string;
  /** Só a amostra mais recente: a API devolve `take: 1`. */
  telemetries: Telemetry[];
}

export type AgentAction = 'shutdown' | 'reboot' | 'suspend';
