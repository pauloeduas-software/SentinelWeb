import type { ParsedAgentMessage } from '../../shared/agent-protocol.types';
import { toHandshakeData, toTelemetryData } from '../helpers/normalize-payload.helper';
import { registerHandshake } from '../../endpoint/use-cases/register-handshake.usecase';
import { saveTelemetry } from '../../endpoint/use-cases/save-telemetry.usecase';
import { touchEndpoint } from '../../endpoint/use-cases/touch-endpoint.usecase';
import { registrarUsuarioObservado } from '../../reconciliation/use-cases/record-user-observation.usecase';
import { registrarMudancasDeHardware } from '../../reconciliation/use-cases/record-hardware-changes.usecase';
import { shortHwid } from '../../endpoint/helpers/hwid.helper';
import { createLogger } from '../../../core/logger/logger';

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
      const dados = toHandshakeData(message);
      const endpoint = await registerHandshake(dados);

      // QUEM ESTAVA LOGADO (F7, Etapa E). Fica aqui, no roteador, e não dentro
      // do `registerHandshake`: inventário é assunto do domínio `endpoint`, e
      // inferir posse a partir de quem usa a máquina é assunto da
      // reconciliação. O handshake é o único ponto em que os dois se encontram,
      // e este arquivo já é o lugar onde a mensagem do agente vira trabalho de
      // mais de um domínio.
      await registrarUsuarioObservado(endpoint.id, dados.loggedOnUser);

      // TROCOU DE PEÇA? (F7, Etapa B — a `AssetChange`.) Mesmo lugar e mesma
      // razão da linha acima: comparar o que o agente trouxe com o que estava
      // gravado é inferência sobre o patrimônio, não inventário. E é o
      // `registerHandshake` que entrega os dois lados da comparação, porque
      // depois do `upsert` o valor velho não existe mais em lugar nenhum.
      await registrarMudancasDeHardware(
        endpoint.id, endpoint.assetId, endpoint.anterior, endpoint.atual,
      );
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
