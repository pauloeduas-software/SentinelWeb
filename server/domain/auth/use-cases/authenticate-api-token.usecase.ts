import { prisma } from '../../../core/database/prismaClient';
import { createLogger } from '../../../core/logger/logger';
import { partirToken, segredoConfere } from '../helpers/api-token.helper';

// A AUTENTICAÇÃO POR TOKEN DE API — o caminho que o D80 quis ter UMA vez só.
//
// Ele serve o agente hoje e servirá o token pessoal da F11 sem mudar: o que
// muda é o `ownerType` esperado, que vem por parâmetro.

const logger = createLogger('api-token');

export interface TokenAutenticado {
  id: string;
  ownerType: 'AGENT' | 'USER';
  userId: string | null;
  endpointId: string | null;
  name: string;
}

/**
 * Confere o token e devolve a linha, ou `null`.
 *
 * AS QUATRO CHECAGENS, e nenhuma é dispensável:
 *   1. a forma (`prefixo.segredo`) — o que não a tem não é nosso;
 *   2. o prefixo existe;
 *   3. o segredo bate, em tempo constante;
 *   4. não foi revogado.
 *
 * `lastUsedAt` é carimbado FORA do caminho de resposta (sem `await`): é dado de
 * observabilidade, e segurar o handshake de um agente por um `UPDATE` seria
 * pagar latência de escrita em toda mensagem da frota.
 */
export async function authenticateApiToken(
  token: string,
  ownerType: 'AGENT' | 'USER',
): Promise<TokenAutenticado | null> {
  const partes = partirToken(token);
  if (!partes) return null;

  const linha = await prisma.apiToken.findUnique({
    where: { prefix: partes.prefix },
    select: {
      id: true, ownerType: true, userId: true, endpointId: true,
      name: true, tokenHash: true, revokedAt: true,
    },
  });

  if (!linha) return null;
  if (linha.ownerType !== ownerType) return null;
  if (!segredoConfere(partes.segredo, linha.tokenHash)) return null;

  if (linha.revokedAt) {
    // `warn` e não silêncio: token revogado que continua sendo usado é uma
    // máquina que não recebeu a notícia — ou alguém tentando com uma cópia.
    logger.warn(`[ApiToken] Token revogado em uso: ${linha.name} (${partes.prefix}).`);
    return null;
  }

  void prisma.apiToken
    .update({ where: { id: linha.id }, data: { lastUsedAt: new Date() } })
    .catch(() => undefined);

  return {
    id: linha.id,
    ownerType: linha.ownerType,
    userId: linha.userId,
    endpointId: linha.endpointId,
    name: linha.name,
  };
}
