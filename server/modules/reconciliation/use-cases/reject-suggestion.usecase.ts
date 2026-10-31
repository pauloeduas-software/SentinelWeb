import { prisma } from '../../../infra/database/prismaClient';
import { AppError } from '../../../infra/errors/app-error';
import { recordAudit } from '../../audit/use-cases/record-audit.usecase';
import type { Ator } from '../../audit/audit.types';
import { SUGGESTION_SELECT } from '../helpers/suggestion-select.helper';

/**
 * "Não." — e o sistema tem que lembrar disso, mas não para sempre.
 *
 * A linha NÃO é apagada: ela vira `REJECTED` e fica. É ela que o
 * `proporSugestao` consulta antes de reoferecer, e é a comparação do
 * `evidenceHash` que transforma a recusa em "já me disseram não sobre ISTO" em
 * vez de "nunca mais me fale deste par" (D97).
 *
 * Sem a linha, o job reoferece a mesma sugestão de hora em hora e a fila vira
 * ruído. Com uma linha sem hash, a recusa correta de hoje esconderia a sugestão
 * correta de amanhã — e o rollout do agente vai produzir exatamente isso às
 * centenas, quando máquinas que não mandavam serial passarem a mandar.
 */
export async function recusarSugestao(id: string, ator: Ator) {
  const sugestao = await prisma.reconciliationSuggestion.findUnique({
    where: { id },
    select: { id: true, state: true },
  });
  if (!sugestao) throw new AppError('Sugestão não encontrada.', 404);
  if (sugestao.state !== 'PENDING') {
    throw new AppError('Esta sugestão já foi resolvida.', 409);
  }

  // `updateMany` com `state: 'PENDING'` no WHERE: a conferência acima e esta
  // escrita não são atômicas, e um aceite simultâneo pode resolver a sugestão
  // no meio. Aqui o Postgres decide — se ela não está mais pendente, a linha
  // não casa e a recusa não grava REJECTED por cima de um vínculo já feito.
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.reconciliationSuggestion.updateMany({
      where: { id, state: 'PENDING' },
      data: { state: 'REJECTED', resolvedAt: new Date() },
    });
    if (count === 0) throw new AppError('Esta sugestão já foi resolvida.', 409);

    const recusada = await tx.reconciliationSuggestion.findUniqueOrThrow({ where: { id }, select: SUGGESTION_SELECT });

    // Na MÁQUINA, como a triagem: é dela que a sugestão falava (AB).
    await recordAudit(tx, {
      entityType: 'Endpoint',
      entityId: recusada.endpoint.id,
      entityLabel: recusada.endpoint.hostname,
      action: 'REJECT',
      changes: {
        sugestaoId: id,
        assetId: recusada.asset?.id ?? null,
        assetTag: recusada.asset?.assetTag ?? null,
        sinal: recusada.signal,
        pontos: recusada.score,
      },
    }, ator);

    return recusada;
  });
}
