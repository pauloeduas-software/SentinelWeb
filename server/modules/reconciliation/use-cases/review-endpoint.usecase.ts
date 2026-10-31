import type { ReviewState } from '@prisma/client';
import { prisma } from '../../../infra/database/prismaClient';
import { AppError } from '../../../infra/errors/app-error';
import { recordAudit } from '../../audit/use-cases/record-audit.usecase';
import type { Ator } from '../../audit/audit.types';

/**
 * A TRIAGEM DO SHADOW IT — o que fazer com a máquina que apareceu sozinha.
 *
 * `ALLOWED` é "eu sei o que é isso e está tudo bem" (a máquina do estagiário, o
 * servidor de build). `BLOCKED` é "isto não deveria estar na rede". Nenhum dos
 * dois MEXE na máquina: este sistema descobre e registra, não desliga ninguém
 * remotamente por causa de um rótulo — o comando remoto existe, é outra rota, e
 * é uma decisão humana explícita.
 *
 * O valor da triagem é tirar da fila o que já foi olhado. Sem ela, a mesma
 * máquina conhecida aparece como "não autorizada" toda semana, e o alerta que
 * repete é o alerta que ninguém lê.
 *
 * `entityType: 'Endpoint'` e não `'Asset'`: aqui a máquina AINDA NÃO é um ativo —
 * é justamente esse o assunto. É a única ação da fase que registra na entidade
 * do RMM, e por isso ela não aparece no histórico de ativo nenhum.
 */
export async function triarEndpoint(endpointId: string, reviewState: ReviewState, ator: Ator) {
  return prisma.$transaction(async (tx) => {
    // A trava antes de ler o "de": duas triagens ao mesmo tempo leriam as duas
    // o estado velho, e a auditoria teria duas trocas a partir dele. NO KEY,
    // como no catálogo: `reviewState` não é chave, e o FOR UPDATE do vínculo
    // seguraria a telemetria que chega da máquina enquanto isso.
    await tx.$queryRaw`SELECT id FROM endpoints WHERE id = ${endpointId}::uuid FOR NO KEY UPDATE`;
    const endpoint = await tx.endpoint.findUnique({
      where: { id: endpointId },
      select: { id: true, hostname: true, reviewState: true },
    });
    if (!endpoint) throw new AppError('Máquina não encontrada.', 404);

    if (endpoint.reviewState === reviewState) return endpoint;

    const triado = await tx.endpoint.update({
      where: { id: endpointId },
      data: { reviewState },
      select: { id: true, hostname: true, reviewState: true },
    });

    await recordAudit(tx, {
      entityType: 'Endpoint',
      entityId: endpointId,
      entityLabel: endpoint.hostname,
      action: 'UPDATE',
      changes: { reviewState: { de: endpoint.reviewState, para: reviewState } },
    }, ator);

    return triado;
  });
}
