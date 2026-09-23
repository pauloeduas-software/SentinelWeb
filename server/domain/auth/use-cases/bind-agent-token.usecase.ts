import { prisma } from '../../../core/database/prismaClient';
import { createLogger } from '../../../core/logger/logger';

// O VÍNCULO DO TOKEN COM A MÁQUINA — no PRIMEIRO handshake (D80).
//
// O token do agente é gerado quando o agente é INSTALADO, antes de a máquina
// existir no sistema. Então `endpointId` nasce nulo e é preenchido aqui, na
// primeira vez que o agente se apresenta.
//
// A PARTIR DAÍ, O MESMO TOKEN VINDO DE OUTRA MÁQUINA É SINAL DE TOKEN COPIADO,
// e vira ALERTA — não um `UPDATE` silencioso do vínculo. É a diferença entre
// "esta credencial é desta máquina" e "esta credencial é de quem a tiver": sem
// a recusa, copiar o token de um notebook para outro daria acesso ao hub e o
// sistema registraria os dois como o mesmo agente.

const logger = createLogger('agent.vinculo');

export async function vincularTokenAoEndpoint(
  tokenId: string,
  endpointId: string,
  hwid: string,
): Promise<void> {
  const token = await prisma.apiToken.findUnique({
    where: { id: tokenId },
    select: { id: true, name: true, endpointId: true },
  });
  if (!token) return;

  if (token.endpointId === endpointId) return;

  if (token.endpointId) {
    logger.error(
      `[Agent] TOKEN COPIADO: "${token.name}" está vinculado a outra máquina e ` +
        `chegou de ${hwid}. Revogue o token e emita um novo para cada agente.`,
    );
    return;
  }

  // `updateMany` com `endpointId: null` no `where`: dois handshakes simultâneos
  // do mesmo agente passariam os dois pelo `if` acima — o vínculo é gravado uma
  // vez só, e o perdedor não sobrescreve nada.
  const { count } = await prisma.apiToken.updateMany({
    where: { id: tokenId, endpointId: null },
    data: { endpointId },
  });

  if (count === 1) {
    logger.info(`[Agent] Token "${token.name}" vinculado ao endpoint ${hwid}.`);
  }
}
