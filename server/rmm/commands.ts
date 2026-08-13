import { FastifyInstance } from 'fastify';
import { sanitizeHwid } from '../core/utils';
import { activeAgents } from './agent-hub';

export default async function rmmCommandsRoutes(server: FastifyInstance) {
  server.post('/api/assets/:hwid/command', async (request, reply) => {
    const { hwid } = request.params as { hwid: string };
    const { action } = request.body as { action: string };
    const cleanHwid = sanitizeHwid(hwid);

    const socket = activeAgents.get(cleanHwid);

    if (!socket) {
      return reply.status(404).send({ error: "Agente offline ou não encontrado." });
    }

    const commandPacket = JSON.stringify({
      Type: "Command",
      Payload: { Action: action, CommandId: crypto.randomUUID() }
    });

    socket.send(commandPacket);
    console.log(`[COMANDO]: ${action} enviado para ${cleanHwid.substring(0, 8)}`);
    return { message: "Comando enviado." };
  });
}
