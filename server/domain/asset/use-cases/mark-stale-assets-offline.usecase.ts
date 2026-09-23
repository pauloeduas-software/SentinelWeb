import { prisma } from '../../../core/database/prismaClient';

// Tolerância antes de considerar a máquina sumida. Precisa ser maior que o
// intervalo de heartbeat do agente, senão uma rede lenta derruba o status.
export const STALE_AFTER_MS = 4 * 60 * 1000;

// Agente que morreu sem fechar o WebSocket (queda de energia, cabo arrancado,
// processo morto) fica ONLINE para sempre: nenhum `close` chega. Este use-case
// é a rede de segurança — quem não dá sinal há STALE_AFTER_MS vira OFFLINE.
export async function markStaleAssetsOffline(): Promise<number> {
  const cutoff = new Date(Date.now() - STALE_AFTER_MS);

  const { count } = await prisma.asset.updateMany({
    where: {
      status: 'ONLINE',
      lastSeen: { lt: cutoff },
    },
    data: { status: 'OFFLINE' },
  });

  return count;
}
