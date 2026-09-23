import { randomUUID } from 'crypto';
import { AppError } from '../../../core/errors/app-error';
import { sendToAgent } from '../../agent/agent.registry';
import { sanitizeHwid, shortHwid } from '../helpers/hwid.helper';
import { createLogger } from '../../../core/logger/logger';

const logger = createLogger('endpoint.command');

export interface SentCommand {
  commandId: string;
}

// Dispara um comando de nível de sistema na máquina. Só chega em agente com
// WebSocket aberto NESTE processo: não há fila nem reenvio — comando para
// máquina offline é recusado na hora, em vez de executar quando ela voltar
// (desligar uma máquina que religou horas depois seria pior que falhar).
export async function sendCommand(hwid: string, action: string): Promise<SentCommand> {
  const clean = sanitizeHwid(hwid);
  const commandId = randomUUID();

  const delivered = sendToAgent(clean, {
    Type: 'Command',
    Payload: { Action: action, CommandId: commandId },
  });

  if (!delivered) {
    throw new AppError('Agente offline ou não encontrado.', 404, { hwid: clean });
  }

  logger.info(`[Endpoint] Comando ${action} enviado para ${shortHwid(clean)}`, { commandId });
  return { commandId };
}
