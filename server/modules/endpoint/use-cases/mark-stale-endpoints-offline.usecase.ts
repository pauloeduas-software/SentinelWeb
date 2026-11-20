import { prisma } from '../../../infra/database/prismaClient';

// Tolerância antes de considerar a máquina sumida: o maior intervalo do `Ping`
// do agente (60 s) mais 60 s de folga, a regra do Fleet (`OnlineIntervalBuffer`
// em `server/fleet/hosts.go`). A folga é o que impede uma rede lenta de derrubar
// o status (CS).
export const STALE_AFTER_MS = 2 * 60 * 1000;

// Máquina que sumiu sem fechar o WebSocket (queda de energia, cabo arrancado,
// máquina suspensa) fica ONLINE para sempre: nenhum `close` chega. O processo do
// agente que morre não é este caso: o sistema fecha a conexão dele. Este use-case
// é a rede de segurança — quem não dá sinal há STALE_AFTER_MS vira OFFLINE.
export async function markStaleEndpointsOffline(): Promise<number> {
  const cutoff = new Date(Date.now() - STALE_AFTER_MS);

  const { count } = await prisma.endpoint.updateMany({
    where: {
      status: 'ONLINE',
      lastSeen: { lt: cutoff },
    },
    data: { status: 'OFFLINE' },
  });

  return count;
}
