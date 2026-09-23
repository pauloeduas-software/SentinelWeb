import type { WebSocket } from 'ws';
import type { AgentCommandPacket } from '../shared/agent-protocol.types';
import { sanitizeHwid, shortHwid } from '../asset/helpers/hwid.helper';
import { createLogger } from '../../core/logger/logger';

const logger = createLogger('agent.registry');

// Conexões vivas com os agentes, NESTE processo (HWID -> WebSocket). É o único
// lugar que conhece o mapa: quem precisa falar com um agente (ex.: o use-case
// de comando) usa `sendToAgent`, sem importar o hub inteiro — o que também
// evita ciclo de import entre os domínios `agent` e `asset`.
//
// Estado de processo, não de cluster: com mais de uma instância do servidor,
// isto vira um registro compartilhado (Redis) — hoje o deploy é single-node.
const activeAgents = new Map<string, WebSocket>();

export function registerAgent(hwid: string, socket: WebSocket): void {
  activeAgents.set(sanitizeHwid(hwid), socket);
}

// A conexão só é removida se ainda for a MESMA registrada: numa reconexão
// rápida o `close` do socket velho chega depois do `Handshake` do novo, e
// apagar por HWID derrubaria o agente que acabou de entrar.
export function unregisterAgent(hwid: string, socket: WebSocket): boolean {
  const clean = sanitizeHwid(hwid);
  if (activeAgents.get(clean) !== socket) return false;
  activeAgents.delete(clean);
  return true;
}

export function isAgentOnline(hwid: string): boolean {
  return activeAgents.has(sanitizeHwid(hwid));
}

export function countAgentsOnline(): number {
  return activeAgents.size;
}

/** Entrega um pacote ao agente. `false` = agente não está conectado aqui. */
export function sendToAgent(hwid: string, packet: AgentCommandPacket): boolean {
  const socket = activeAgents.get(sanitizeHwid(hwid));
  if (!socket) return false;
  socket.send(JSON.stringify(packet));
  return true;
}

// Encerramento gracioso: avisa os agentes antes de o processo sair, para que
// reconectem em vez de esperar o timeout.
export function disconnectAllAgents(): void {
  if (activeAgents.size > 0) {
    logger.info(`[Agent] Encerrando ${activeAgents.size} conexão(ões) de agente...`);
  }
  for (const [hwid, socket] of activeAgents) {
    try {
      socket.close(1001, 'Servidor encerrando');
    } catch (error) {
      logger.warn(`[Agent] Falha ao encerrar conexão de ${shortHwid(hwid)}:`, error);
    }
  }
  activeAgents.clear();
}
