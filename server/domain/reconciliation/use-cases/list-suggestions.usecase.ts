import { prisma } from '../../../core/database/prismaClient';
import type { ListEnvelope } from '../../../core/http/list-query';
import { SUGGESTION_SELECT } from '../helpers/suggestion-select.helper';

/**
 * Teto fixo e generoso: a fila é para ser esvaziada, não paginada. Se ela
 * passar de 200 itens o problema não é a paginação.
 */
const TETO_DA_FILA = 200;

/**
 * A fila — só as PENDENTES, que é a pergunta da operação: quem abre a tela
 * quer trabalho a fazer.
 *
 * ORDENADA POR PONTUAÇÃO e depois por idade, não por data de criação: quem abre
 * a tela tem tempo para as dez primeiras, e as dez primeiras têm que ser as mais
 * confiáveis. Uma fila em ordem cronológica mostraria primeiro a sugestão de 60
 * pontos de terça e enterraria a de 100 pontos de hoje.
 */
export async function listarSugestoes() {
  const where = { state: 'PENDING' as const };

  const [total, rows] = await prisma.$transaction([
    prisma.reconciliationSuggestion.count({ where }),
    prisma.reconciliationSuggestion.findMany({
      where,
      select: SUGGESTION_SELECT,
      orderBy: [{ score: 'desc' }, { createdAt: 'asc' }],
      take: TETO_DA_FILA,
    }),
  ]);

  return { total, rows } satisfies ListEnvelope<unknown>;
}
