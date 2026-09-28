import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
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
 * correta de amanhã — e o rollout do agente C# vai produzir exatamente isso às
 * centenas, quando máquinas que não mandavam serial passarem a mandar.
 */
export async function recusarSugestao(id: string, actorId: string | null) {
  const sugestao = await prisma.reconciliationSuggestion.findUnique({
    where: { id },
    select: { id: true, state: true },
  });
  if (!sugestao) throw new AppError('Sugestão não encontrada.', 404);
  if (sugestao.state !== 'PENDING') {
    throw new AppError('Esta sugestão já foi resolvida.', 409);
  }

  return prisma.reconciliationSuggestion.update({
    where: { id },
    data: { state: 'REJECTED', resolvedAt: new Date(), resolvedById: actorId },
    select: SUGGESTION_SELECT,
  });
}
