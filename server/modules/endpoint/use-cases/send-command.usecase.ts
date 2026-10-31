import { randomUUID } from 'crypto';
import { prisma } from '../../../infra/database/prismaClient';
import { AppError } from '../../../infra/errors/app-error';
import { recordAuditDoQueJaAconteceu } from '../../audit/use-cases/record-audit.usecase';
import type { Ator } from '../../audit/audit.types';
import { sendToAgent } from '../../agent/agent.registry';
import { shortHwid } from '../helpers/hwid.helper';
import { createLogger } from '../../../infra/logger/logger';

const logger = createLogger('endpoint.command');

interface SentCommand {
  commandId: string;
}

/**
 * Dispara um comando de nível de sistema na máquina.
 *
 * Só chega em agente com WebSocket aberto NESTE processo: não há fila nem
 * reenvio — comando para máquina offline é recusado na hora, em vez de executar
 * quando ela voltar (desligar uma máquina que religou horas depois seria pior
 * que falhar).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * RECEBE O ID DA MÁQUINA, E RESOLVE O HWID AQUI DENTRO.
 *
 * A rota era `POST /api/endpoints/:hwid/command`, e o hwid vinha da URL. Ele é a
 * identidade de HARDWARE, derivada pelo agente, e era o painel que o carregava:
 * a tela de telemetria tinha a frota inteira em memória, então tinha o hwid de
 * todas.
 *
 * As telas que herdaram o comando não têm. A aba Máquina do ativo sabe o
 * `endpointId` — é o que `GET /api/assets/:id/machine` devolve, e ele não devolve
 * hwid —, e acrescentar o hwid àquela resposta só para formar a URL seria
 * acrescentar campo a uma rota de leitura para servir uma de escrita. O id
 * resolve, e é a chave que todo o resto do sistema já usa para falar de uma
 * máquina (`:id/link`, `:id/review`).
 *
 * Isto NÃO é esconder o hwid: ele continua saindo na listagem e na rota de uma
 * máquina, porque é coluna do `Endpoint`, e a aba Máquina do ativo o mostra com
 * um botão de copiar — é o que se cola num chamado. O que sai da URL é a
 * identidade de HARDWARE como ENDEREÇO, e com ela sai o `{ hwid }` que o
 * erro espalhava no corpo da resposta.
 *
 * E ISSO SEPAROU DOIS ERROS QUE ERAM UM. Com o hwid na URL, "máquina não existe"
 * e "máquina existe e está offline" eram o mesmo 404 — não havia como distinguir,
 * porque não se consultava o banco. Agora se consulta:
 *
 *   404 — este id não é de máquina nenhuma. É o 404 de todas as rotas.
 *   409 — a máquina existe; o agente dela não está conectado. É conflito com o
 *         estado atual, não ausência de recurso, e a mensagem NOMEIA a máquina,
 *         porque quem está na tela precisa saber qual não respondeu.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export async function sendCommand(endpointId: string, action: string, ator: Ator): Promise<SentCommand> {
  const maquina = await prisma.endpoint.findUnique({
    where: { id: endpointId },
    select: { hwid: true, hostname: true },
  });

  if (!maquina) throw new AppError('Máquina não encontrada.', 404);

  const commandId = randomUUID();

  // `sendToAgent` normaliza o hwid por dentro (`sanitizeHwid`), que é a mesma
  // normalização que o `registerAgent` aplicou na chave — então o valor do banco
  // acha o socket sem tratamento aqui.
  const entrega = await sendToAgent(maquina.hwid, {
    Type: 'Command',
    Payload: { Action: action, CommandId: commandId },
  });

  if (entrega === 'DESCONECTADO') {
    throw new AppError(
      `O agente de ${maquina.hostname} não está conectado agora. `
        + 'O comando não fica em fila: ele só chega em máquina online.',
      409,
    );
  }

  // O SOCKET EXISTIA E A ESCRITA FALHOU — a conexão caiu entre a conferência e
  // o envio, ou o sistema recusou os bytes. Não é o 409 de cima: a máquina não
  // estava offline quando se perguntou, e é o caminho para o agente que
  // falhou. 502, e a resposta diz isso: a rota não responde sucesso sem o
  // pacote ter saído, e é a tela que decide tentar de novo.
  if (entrega === 'FALHOU') {
    throw new AppError(
      `O envio ao agente de ${maquina.hostname} falhou: a conexão caiu antes de o comando sair. `
        + 'Nada foi entregue — tente de novo em instantes.',
      502,
    );
  }

  logger.info(`[Endpoint] Comando ${action} entregue a ${shortHwid(maquina.hwid)}`, { commandId });

  // Só o que SAIU para a máquina (AB): o desconectado e a falha não entregaram
  // nada. Depois do envio, porque o comando não volta atrás — gravado antes, a
  // auditoria afirmaria um desligamento que nunca saiu. "Saiu" é a conexão ter
  // aceitado os bytes: o agente não confirma a execução, e a máquina que perdeu
  // a rede sem fechar o socket não recebe o que a linha diz que foi mandado.
  // E a gravação que falhar não vira 500: o comando já saiu.
  await recordAuditDoQueJaAconteceu({
    entityType: 'Endpoint',
    entityId: endpointId,
    entityLabel: maquina.hostname,
    action: 'COMMAND',
    changes: { comando: action, commandId },
  }, ator);

  return { commandId };
}
