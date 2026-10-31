import { prisma } from '../../../infra/database/prismaClient';
import { errorCode } from '../../../infra/errors/error-shape';
import { sanitizeHwid, shortHwid } from '../helpers/hwid.helper';
import { createLogger } from '../../../infra/logger/logger';

const logger = createLogger('endpoint.offline');

// Desconexão formal: o WebSocket do agente caiu. Diferente do job de zumbis,
// aqui a saída é imediata e sabida — não esperamos os 4 minutos de tolerância.
export async function markEndpointOffline(hwid: string): Promise<void> {
  const clean = sanitizeHwid(hwid);
  try {
    await prisma.endpoint.update({
      where: { hwid: clean },
      data: { status: 'OFFLINE', lastSeen: new Date() },
    });
    logger.info(`[Endpoint] Agente ${shortHwid(clean)} desconectado.`);
  } catch (error) {
    // Máquina que caiu antes de concluir o Handshake nunca chegou ao banco
    if (errorCode(error) === 'P2025') return;
    logger.error(`[Endpoint] Falha ao marcar ${shortHwid(clean)} como offline:`, error);
  }
}
