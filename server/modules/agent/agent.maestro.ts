import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { parseAgentMessage } from './helpers/parse-agent-message.helper';
import { registerAgent, unregisterAgent } from './agent.registry';
import { handleAgentMessage } from './use-cases/handle-agent-message.usecase';
import { markEndpointOffline } from '../endpoint/use-cases/mark-endpoint-offline.usecase';
import { autenticarAgente, credencialAindaVale } from './helpers/authenticate-agent.helper';
import { agentController } from './controllers/agent.controller';
import { shortHwid } from '../endpoint/helpers/hwid.helper';
import { createLogger } from '../../infra/logger/logger';
import { ENROLL_RATE_LIMIT } from '../../infra/http/write-rate-limit';

const logger = createLogger('agent.maestro');

// Porta de entrada do Agente Sentinel. Aqui só mora transporte: aceitar a
// conexão, traduzir o que chegou e encaminhar. Regra de negócio nenhuma.
//
// DUAS ROTAS, com um segredo cada (CR):
//   `POST /agent-hub/enroll` troca o segredo de instalação (`AGENT_ENROLL_SECRET`)
//   pelo token da máquina;
//   `GET /agent-hub` (WebSocket) só aceita o token da máquina, e a conexão fica
//   presa ao HWID dele.
export class AgentMaestro {
  static async setupRoutes(server: FastifyInstance): Promise<void> {
    // O HWID que o token provou, de cada requisição de upgrade até o handler do
    // socket. WeakMap e não campo novo no `request`: vive o tempo da requisição e
    // não precisa de declaração de tipo no Fastify inteiro.
    const hwidDaConexao = new WeakMap<FastifyRequest, string>();

    const exigirToken = async (request: FastifyRequest, reply: FastifyReply) => {
      const credencial = await autenticarAgente(request.headers.authorization);

      if (credencial) {
        hwidDaConexao.set(request, credencial.hwid);
        return;
      }

      // `preHandler` roda ANTES do upgrade: quem não tem token leva 401 e o
      // WebSocket nem chega a existir — melhor do que aceitar o socket e fechar.
      request.log.warn(
        { ip: request.socket.remoteAddress ?? 'desconhecido' },
        '[Agent] Conexão recusada: token ausente, inválido ou revogado.',
      );
      await reply.status(401).send({ error: 'Token de agente inválido.' });
    };

    // O teto é o do login: a repetição aqui É o ataque (adivinhar o segredo). E o
    // corpo também: a rota é anônima, e sem limite próprio valeria o 1 MiB global
    // do Fastify, quando o cadastro manda só o HWID.
    server.post('/agent-hub/enroll', { ...ENROLL_RATE_LIMIT, bodyLimit: 8 * 1024 }, agentController.enroll);

    server.get('/agent-hub', { websocket: true, preHandler: exigirToken }, (socket, request) => {
      // O token já disse quem é: toda mensagem desta conexão é desta máquina.
      const hwid = hwidDaConexao.get(request)!;
      hwidDaConexao.delete(request);

      socket.on('message', async (raw) => {
        const message = parseAgentMessage(raw.toString());
        if (!message) {
          logger.warn(`[Agent] Mensagem descartada (${shortHwid(hwid)}): formato não reconhecido.`);
          return;
        }

        // O HWID do payload tem de ser o do token. Sem esta conferência, quem tem
        // o token de uma máquina se apresentaria como outra e tomaria o lugar
        // dela no registro — e os comandos dela.
        //
        // E A CONEXÃO FECHA, com 1008 (CU): aberta, ela não serve para nada, e o
        // agente cujo HWID mudou depois do cadastro (o arquivo do HWID apagado ou
        // trocado, o token de outra instalação) ficaria mandando para o vazio sem
        // saber. Com o código, ele diz no log dele por que não entra.
        if (message.hwid !== hwid) {
          logger.warn(
            `[Agent] Conexão fechada: o token é de ${shortHwid(hwid)} e o payload diz ${shortHwid(message.hwid)}.`,
          );
          socket.close(1008, 'HWID diferente do token');
          return;
        }

        // O Handshake é o que vincula ESTA conexão ao HWID: é ele que habilita
        // o envio de comandos para a máquina. A credencial se confere de novo
        // aqui porque a máquina pode ter sido excluída depois da abertura (DD).
        if (message.type === 'Handshake') {
          if (!(await credencialAindaVale(hwid))) {
            socket.close(1008, 'Máquina excluída');
            return;
          }
          registerAgent(hwid, socket);
        }

        try {
          await handleAgentMessage(message);

        } catch (error) {
          logger.error(`[Agent] Falha ao processar ${message.type} de ${shortHwid(hwid)}:`, error);
        }
      });

      socket.on('close', () => {
        // `unregisterAgent` devolve false quando esta conexão já foi substituída
        // por uma reconexão, ou nunca mandou handshake: nos dois casos não mexe.
        if (unregisterAgent(hwid, socket)) void markEndpointOffline(hwid);
      });

      // Sem este handler, um erro de socket derruba o processo inteiro
      socket.on('error', (error) => {
        logger.error(`[Agent] Erro na conexão de ${shortHwid(hwid)}:`, error);
      });
    });

    logger.debug('[Maestro] Hub de agentes inicializado em /agent-hub.');
  }
}
