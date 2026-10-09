import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { parseAgentMessage } from './helpers/parse-agent-message.helper';
import { registerAgent, unregisterAgent } from './agent.registry';
import { handleAgentMessage } from './use-cases/handle-agent-message.usecase';
import { markEndpointOffline } from '../endpoint/use-cases/mark-endpoint-offline.usecase';
import { autenticarAgente } from './helpers/authenticate-agent.helper';
import { shortHwid } from '../endpoint/helpers/hwid.helper';
import { createLogger } from '../../core/logger/logger';

const logger = createLogger('agent.maestro');

// Porta de entrada do Agente Sentinel (C#). Aqui só mora transporte: aceitar a
// conexão, traduzir o que chegou e encaminhar. Regra de negócio nenhuma.
//
// A rota exige `Authorization: Bearer <token>`, conferido contra o
// `AGENT_TOKEN` do `.env`. Eram dois formatos em transição (D89); o `ApiToken`
// por agente saiu no D149, e com ele o vínculo token↔máquina.
export class AgentMaestro {
  static async setupRoutes(server: FastifyInstance): Promise<void> {
    const exigirToken = async (request: FastifyRequest, reply: FastifyReply) => {
      const ip = request.socket.remoteAddress ?? 'desconhecido';
      const forma = await autenticarAgente(request.headers.authorization);

      if (forma) return;

      // `preHandler` roda ANTES do upgrade: quem não tem token leva 401 e o
      // WebSocket nem chega a existir — melhor do que aceitar o socket e fechar.
      request.log.warn(
        { ip },
        '[Agent] Conexão recusada: token ausente ou inválido.',
      );
      await reply.status(401).send({ error: 'Token de agente inválido.' });
    };

    server.get('/agent-hub', { websocket: true, preHandler: exigirToken }, (socket, request) => {
      const remote = request.socket.remoteAddress ?? 'desconhecido';
      // Só é conhecido a partir da primeira mensagem válida
      let hwid: string | null = null;

      socket.on('message', async (raw) => {
        const message = parseAgentMessage(raw.toString());
        if (!message) {
          logger.warn(`[Agent] Mensagem descartada (${remote}): formato não reconhecido.`);
          return;
        }

        hwid = message.hwid;
        // O Handshake é o que vincula ESTA conexão ao HWID: é ele que habilita
        // o envio de comandos para a máquina.
        if (message.type === 'Handshake') registerAgent(message.hwid, socket);

        try {
          await handleAgentMessage(message);

        } catch (error) {
          logger.error(`[Agent] Falha ao processar ${message.type} de ${shortHwid(message.hwid)}:`, error);
        }
      });

      socket.on('close', () => {
        if (!hwid) return;
        // `unregisterAgent` devolve false quando esta conexão já foi substituída
        // por uma reconexão: nesse caso a máquina continua online, não mexe.
        if (unregisterAgent(hwid, socket)) void markEndpointOffline(hwid);
      });

      // Sem este handler, um erro de socket derruba o processo inteiro
      socket.on('error', (error) => {
        logger.error(`[Agent] Erro na conexão de ${hwid ? shortHwid(hwid) : remote}:`, error);
      });
    });

    logger.info('[Maestro] Hub de agentes inicializado em /agent-hub.');
  }
}
