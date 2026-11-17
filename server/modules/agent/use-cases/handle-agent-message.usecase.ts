import type { ParsedAgentMessage } from '../../shared/agent-protocol.types';
import { toHandshakeData, toTelemetryData } from '../helpers/normalize-payload.helper';
import { registerHandshake } from '../../endpoint/use-cases/register-handshake.usecase';
import { saveTelemetry } from '../../endpoint/use-cases/save-telemetry.usecase';
import { touchEndpoint } from '../../endpoint/use-cases/touch-endpoint.usecase';
import { vincularPelaSerie } from '../../reconciliation/use-cases/auto-link-endpoint.usecase';
import { shortHwid } from '../../endpoint/helpers/hwid.helper';
import { desconectarAgente } from '../agent.registry';
import { createLogger } from '../../../infra/logger/logger';

const logger = createLogger('agent.message');

// Roteia a mensagem já traduzida para o use-case do domínio dono do assunto.
// É a única função que conhece os três tipos de mensagem do agente — quem
// quiser saber o que o agente faz lê este arquivo.
export async function handleAgentMessage(message: ParsedAgentMessage): Promise<void> {
  // Presença primeiro: qualquer mensagem prova que a máquina está viva, mesmo
  // que o tratamento específico abaixo falhe.
  await touchEndpoint(message.hwid);

  switch (message.type) {
    case 'Handshake': {
      // O vínculo automático depois de gravar: é a série DESTE handshake que a
      // regra compara com o cadastro, como o GLPI na chegada do inventário (DC).
      const endpointId = await registerHandshake(toHandshakeData(message));
      // Excluída entre a conferência da credencial no maestro e a gravação: a
      // conexão fecha, como a exclusão fecharia se já a tivesse achado.
      if (!endpointId) {
        desconectarAgente(message.hwid, 'Máquina excluída');
        break;
      }
      await vincularPelaSerie(endpointId);
      break;
    }

    case 'Telemetry':
      await saveTelemetry(toTelemetryData(message));
      break;

    case 'Ping':
      // Heartbeat puro: já tratado pelo touchEndpoint acima
      logger.debug(`[Agent] Ping de ${shortHwid(message.hwid)}`);
      break;
  }
}
