import type { ParsedAgentMessage } from '../../shared/agent-protocol.types';
import { toHandshakeData, toTelemetryData } from '../helpers/normalize-payload.helper';
import { registerHandshake } from '../../asset/use-cases/register-handshake.usecase';
import { saveTelemetry } from '../../asset/use-cases/save-telemetry.usecase';
import { touchAsset } from '../../asset/use-cases/touch-asset.usecase';
import { shortHwid } from '../../asset/helpers/hwid.helper';
import { createLogger } from '../../../core/logger/logger';

const logger = createLogger('agent.message');

// Roteia a mensagem já traduzida para o use-case do domínio dono do assunto.
// É a única função que conhece os três tipos de mensagem do agente — quem
// quiser saber o que o agente faz lê este arquivo.
export async function handleAgentMessage(message: ParsedAgentMessage): Promise<void> {
  // Presença primeiro: qualquer mensagem prova que a máquina está viva, mesmo
  // que o tratamento específico abaixo falhe.
  await touchAsset(message.hwid);

  switch (message.type) {
    case 'Handshake':
      await registerHandshake(toHandshakeData(message));
      break;

    case 'Telemetry':
      await saveTelemetry(toTelemetryData(message));
      break;

    case 'Ping':
      // Heartbeat puro: já tratado pelo touchAsset acima
      logger.debug(`[Agent] Ping de ${shortHwid(message.hwid)}`);
      break;
  }
}
