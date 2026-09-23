import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { parseAgentMessage } from './helpers/parse-agent-message.helper';
import { registerAgent, unregisterAgent } from './agent.registry';
import { handleAgentMessage } from './use-cases/handle-agent-message.usecase';
import { markAssetOffline } from '../asset/use-cases/mark-asset-offline.usecase';
import { isAgentAuthorized } from './helpers/authenticate-agent.helper';
import { shortHwid } from '../asset/helpers/hwid.helper';
import { createLogger } from '../../core/logger/logger';

const logger = createLogger('agent.maestro');

// Porta de entrada do Agente Sentinel (C#). Aqui só mora transporte: aceitar a
// conexão, traduzir o que chegou e encaminhar. Regra de negócio nenhuma.
//
// A rota exige `Authorization: Bearer <AGENT_TOKEN>`. O `ApiToken` por agente
// (prefixo, hash, revogação, lastUsedAt) é a Fase 3; este segredo compartilhado
// é o que tira a porta aberta do ar enquanto isso.
export class AgentMaestro {
  static async setupRoutes(server: FastifyInstance): Promise<void> {
    const exigirToken = async (request: FastifyRequest, reply: FastifyReply) => {
      if (isAgentAuthorized(request.headers.authorization)) return;

      // `preHandler` roda ANTES do upgrade: quem não tem token leva 401 e o
      // WebSocket nem chega a existir — melhor do que aceitar o socket e fechar.
      request.log.warn(
        { ip: request.socket.remoteAddress },
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
        if (unregisterAgent(hwid, socket)) void markAssetOffline(hwid);
      });

      // Sem este handler, um erro de socket derruba o processo inteiro
      socket.on('error', (error) => {
        logger.error(`[Agent] Erro na conexão de ${hwid ? shortHwid(hwid) : remote}:`, error);
      });
    });

    logger.info('[Maestro] Hub de agentes inicializado em /agent-hub.');
  }
}
