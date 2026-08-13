import { FastifyInstance } from 'fastify';
import { prisma } from '../core/db';
import { sanitizeHwid, updateLastSeen } from '../core/utils';
import { handleHandshake } from '../itam/assets';
import { handleTelemetry } from './telemetry';

// Mapa global para gerenciar conexões ativas (HWID -> Socket)
export const activeAgents = new Map<string, any>();

export default async function agentHubRoutes(server: FastifyInstance) {
  server.get('/agent-hub', { websocket: true }, (socket, req) => {
    const clientId = req.socket.remoteAddress || 'Unknown';
    let currentHwid: string | null = null;

    socket.on('message', async (data: any) => {
      try {
        const message = JSON.parse(data.toString());
        const { Type, Payload } = message;

        const rawHwid = Payload?.Hwid || Payload?.hwid;
        if (!rawHwid) return;

        const hwid = sanitizeHwid(rawHwid);
        currentHwid = hwid;

        // Reset de inatividade: Qualquer mensagem (Handshake, Telemetry, Ping) reseta o LastSeen
        await updateLastSeen(hwid);

        if (Type === 'Handshake') {
          activeAgents.set(hwid, socket);
          await handleHandshake(Payload);
        } else if (Type === 'Telemetry') {
          await handleTelemetry(Payload);
        } else if (Type === 'Ping') {
          // Heartbeat explícito já tratado pelo updateLastSeen acima
          console.log(`[HEARTBEAT]: ${hwid.substring(0, 8)}`);
        }
      } catch (err) {
        console.error('[ERRO]: Falha no parser de mensagem:', err);
      }
    });

    socket.on('close', async () => {
      if (currentHwid) {
        const cleanHwid = sanitizeHwid(currentHwid);
        activeAgents.delete(cleanHwid);
        try {
          await prisma.asset.update({
            where: { hwid: cleanHwid },
            data: { status: 'OFFLINE', lastSeen: new Date() }
          });
          console.log(`[WS]: Agente ${cleanHwid.substring(0, 8)} desconectado formalmente.`);
        } catch (err) {}
      }
    });
  });

  // Zombie Cleaner (Roda a cada 60s)
  setInterval(async () => {
    const cutoff = new Date(Date.now() - 4 * 60 * 1000); // 4 minutos de tolerância (UTC)
    
    try {
      const expired = await prisma.asset.updateMany({
        where: {
          status: 'ONLINE',
          lastSeen: { lt: cutoff }
        },
        data: { status: 'OFFLINE' }
      });

      if (expired.count > 0) {
        console.log(`[LIMPEZA]: ${expired.count} agentes zumbis removidos.`);
      }
    } catch (err) {
      console.error('[ERRO]: Falha na limpeza de zumbis:', err);
    }
  }, 60000);
}
