import { prisma } from '../../../infra/database/prismaClient';
import { AppError } from '../../../infra/errors/app-error';
import { createLogger } from '../../../infra/logger/logger';
import { isAgentConnected } from '../agent.registry';
import { sanitizeHwid, shortHwid } from '../../endpoint/helpers/hwid.helper';
import { gerarTokenDaMaquina, hashDoToken } from '../helpers/authenticate-agent.helper';

const logger = createLogger('agent.enroll');

/**
 * Cadastra a máquina e devolve o token dela, o único que o `/agent-hub` aceita
 * (CR). O banco guarda só o hash; o token sai daqui uma vez e não volta.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * O RECADASTRO TROCA O TOKEN, MENOS COM A MÁQUINA CONECTADA.
 *
 * A máquina que perdeu o token (revogado, recusado com 401) volta com o mesmo
 * HWID quando alguém põe o segredo de instalação nela de novo: o agente não se
 * recadastra sozinho. Por isso o cadastro de um HWID conhecido
 * substitui o token antigo, que para de valer na hora. A máquina formatada vem
 * com HWID novo, e quem a reconhece é o handshake (CV).
 *
 * Mas quem tem o segredo de instalação poderia, assim, tomar o lugar de uma
 * máquina que está funcionando: cadastrar o HWID dela e passar a receber os
 * comandos dela. Com a máquina conectada a resposta é 409, e a conexão dela
 * continua. É a regra do Wazuh (`src/os_auth/auth.c`: "can't be replaced since
 * it is not disconnected").
 *
 * O que sobra, declarado: a máquina DESLIGADA pode ser recadastrada por quem tem
 * o segredo. É o preço de a reinstalação não pedir ninguém no painel.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export async function enrollAgent(hwidBruto: string): Promise<{ token: string }> {
  const hwid = sanitizeHwid(hwidBruto);

  if (isAgentConnected(hwid)) {
    throw new AppError(
      'Esta máquina já está conectada com outro token. '
        + 'Para cadastrar de novo, pare o agente que está rodando nela ou revogue o token dele.',
      409,
    );
  }

  const token = gerarTokenDaMaquina();
  const tokenHash = hashDoToken(token);
  await prisma.agentCredential.upsert({
    where: { hwid },
    create: { hwid, tokenHash },
    update: { tokenHash, createdAt: new Date() },
  });

  logger.info(`[Agent] Máquina ${shortHwid(hwid)} cadastrada: token novo emitido.`);
  return { token };
}
