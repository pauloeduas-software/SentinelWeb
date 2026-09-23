import { prisma } from '../../../core/database/prismaClient';
import { errorCode } from '../../../core/errors/error-shape';
import { sanitizeHwid, shortHwid } from '../helpers/hwid.helper';
import { createLogger } from '../../../core/logger/logger';

const logger = createLogger('endpoint.touch');

// Marca presença: QUALQUER mensagem do agente (Handshake, Telemetry, Ping)
// zera o contador de inatividade que o job de zumbis usa.
export async function touchEndpoint(hwid: string): Promise<void> {
  try {
    await prisma.endpoint.update({
      where: { hwid: sanitizeHwid(hwid) },
      data: { lastSeen: new Date(), status: 'ONLINE' },
    });
  } catch (error) {
    // P2025 = máquina ainda não fez o Handshake. É o caso normal do primeiro
    // contato, não é erro.
    if (errorCode(error) === 'P2025') return;

    // Qualquer outra falha congela o `lastSeen` e o job de zumbis passa a
    // marcar a frota inteira como OFFLINE. Isso NÃO pode passar em silêncio —
    // era exatamente o risco do catch vazio do antigo core/utils.ts.
    logger.error(`[Endpoint] Falha ao registrar presença de ${shortHwid(hwid)}:`, error);
  }
}
