import type { WebSocket } from 'ws';
import type { AgentCommandPacket } from '../shared/agent-protocol.types';
import { sanitizeHwid, shortHwid } from '../endpoint/helpers/hwid.helper';
import { createLogger } from '../../infra/logger/logger';

const logger = createLogger('agent.registry');

// Conexões vivas com os agentes, NESTE processo (HWID -> WebSocket). É o único
// lugar que conhece o mapa: quem precisa falar com um agente (ex.: o use-case
// de comando) usa `sendToAgent`, sem importar o hub inteiro — o que também
// evita ciclo de import entre os domínios `agent` e `endpoint`.
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

export function countAgentsOnline(): number {
  return activeAgents.size;
}

/**
 * O que aconteceu com um pacote mandado ao agente.
 *
 *   `ENTREGUE`      o socket confirmou que o pacote saiu.
 *   `DESCONECTADO`  não há socket aberto para este HWID neste processo.
 *   `FALHOU`        havia socket, e a escrita nele falhou.
 */
type EntregaAoAgente = 'ENTREGUE' | 'DESCONECTADO' | 'FALHOU';

/**
 * Entrega um pacote ao agente, e só diz `ENTREGUE` quando o socket confirmou.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DEVOLVIA `true` ASSIM QUE ACHAVA O SOCKET NO MAPA — sem olhar o estado dele
 * e sem esperar o `send`. O mapa é atualizado pelo `close` do lado do servidor,
 * que chega DEPOIS de a conexão cair: entre um e outro, o socket está no mapa
 * com `readyState` em CLOSING, o `send` do `ws` descarta o pacote em silêncio
 * (ou grita no callback que ninguém passava), e a rota respondia "Comando
 * enviado" para um comando que não saiu do processo. Quem estava na tela
 * tentando desligar uma máquina lia o sucesso e esperava.
 *
 * Duas conferências, nesta ordem: o `readyState`, que é barato e pega o socket
 * que já está morrendo; e o CALLBACK do `send`, que é a única confirmação que
 * o `ws` dá de que os bytes foram escritos — com erro, se a escrita falhou.
 * "Escrito no socket" ainda não é "o agente leu", e o protocolo não tem
 * confirmação do outro lado; o que esta função promete é não dizer sucesso
 * sem o envio ter acontecido.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export function sendToAgent(hwid: string, packet: AgentCommandPacket): Promise<EntregaAoAgente> {
  const socket = activeAgents.get(sanitizeHwid(hwid));
  // `WebSocket.OPEN` pela instância, e não pela classe, porque `ws` entra aqui
  // só como tipo (`import type`): o valor da constante mora no objeto.
  if (!socket || socket.readyState !== socket.OPEN) return Promise.resolve('DESCONECTADO');

  return new Promise((resolve) => {
    try {
      socket.send(JSON.stringify(packet), (erro) => resolve(erro ? 'FALHOU' : 'ENTREGUE'));
    } catch (erro) {
      logger.warn(`[Agent] Falha ao escrever no socket de ${shortHwid(hwid)}:`, erro);
      resolve('FALHOU');
    }
  });
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
