import type { Prisma, SuggestionKind, SuggestionState } from '@prisma/client';
import { prisma } from '../../../core/database/prismaClient';
import type { ListEnvelope } from '../../../core/http/list-query';
import { SUGGESTION_SELECT } from '../helpers/suggestion-select.helper';

export interface FiltroDeSugestoes {
  state?: SuggestionState;
  kind?: SuggestionKind;
  // `null` aceito ao lado de `undefined`: o `uuidOpcional` do schema devolve
  // null para campo vazio, e obrigar o controller a converter seria espalhar
  // tradução de contrato pela borda.
  endpointId?: string | null;
  assetId?: string | null;
  perPage: number;
}

/**
 * A fila.
 *
 * ORDENADA POR PONTUAÇÃO e depois por idade, não por data de criação: quem abre
 * a tela tem tempo para as dez primeiras, e as dez primeiras têm que ser as mais
 * confiáveis. Uma fila em ordem cronológica mostraria primeiro a sugestão de 60
 * pontos de terça e enterraria a de 100 pontos de hoje.
 *
 * `state` tem padrão `PENDING` porque é a pergunta da operação — o histórico
 * existe e sai com `?state=REJECTED`, mas quem não pede quer trabalho a fazer.
 */
export async function listarSugestoes(filtro: FiltroDeSugestoes) {
  const where: Prisma.ReconciliationSuggestionWhereInput = {
    state: filtro.state ?? 'PENDING',
    ...(filtro.kind ? { kind: filtro.kind } : {}),
    ...(filtro.endpointId ? { endpointId: filtro.endpointId } : {}),
    ...(filtro.assetId ? { assetId: filtro.assetId } : {}),
  };

  const [total, rows] = await prisma.$transaction([
    prisma.reconciliationSuggestion.count({ where }),
    prisma.reconciliationSuggestion.findMany({
      where,
      select: SUGGESTION_SELECT,
      orderBy: [{ score: 'desc' }, { createdAt: 'asc' }],
      take: filtro.perPage,
    }),
  ]);

  return { total, rows } satisfies ListEnvelope<unknown>;
}
