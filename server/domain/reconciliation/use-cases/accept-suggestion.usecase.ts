import type { ReconciliationSuggestion } from '@prisma/client';
import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { SUGGESTION_SELECT } from '../helpers/suggestion-select.helper';
import { vincularEndpointAoAtivo } from './link-endpoint-asset.usecase';

// "Sim." — e é aqui que a sugestão vira CADASTRO.
//
// ─────────────────────────────────────────────────────────────────────────────
// A REGRA: nada aqui escreve direto.
//
// Aceitar chama o `vincularEndpointAoAtivo`, que já carrega o `ActivityLog` e o
// encerramento das sugestões que o vínculo tornou obsoletas — e uma segunda
// escrita, direta, divergiria dele no primeiro ajuste. A fila PROPÕE; quem GRAVA
// é o dono do assunto.
// ─────────────────────────────────────────────────────────────────────────────

type Sugestao = Pick<
  ReconciliationSuggestion,
  'id' | 'state' | 'endpointId' | 'assetId'
>;

async function carregarPendente(id: string): Promise<Sugestao> {
  const sugestao = await prisma.reconciliationSuggestion.findUnique({
    where: { id },
    select: { id: true, state: true, endpointId: true, assetId: true },
  });
  if (!sugestao) throw new AppError('Sugestão não encontrada.', 404);
  if (sugestao.state !== 'PENDING') throw new AppError('Esta sugestão já foi resolvida.', 409);
  return sugestao;
}

/** Fecha a sugestão. Chamado DEPOIS de a ação ter dado certo, nunca antes. */
async function marcarAceita(id: string, actorId: string | null) {
  return prisma.reconciliationSuggestion.update({
    where: { id },
    data: { state: 'ACCEPTED', resolvedAt: new Date(), resolvedById: actorId },
    select: SUGGESTION_SELECT,
  });
}

/**
 * Executa o que a sugestão propõe.
 *
 * A ação e o fechamento NÃO estão na mesma transação, e isso é deliberado: as
 * ações chamam use-cases que abrem transação própria, e aninhar transação do
 * Prisma dentro de transação não é suportado. A ordem — agir, depois fechar — é
 * a que erra para o lado certo: se o processo morrer no meio, a sugestão
 * continua `PENDING` e alguém a vê de novo numa fila que já reflete o cadastro
 * novo. O contrário deixaria uma sugestão "aceita" que nunca aconteceu.
 */
export async function aceitarSugestao(id: string, actorId: string | null) {
  const sugestao = await carregarPendente(id);

  // UM TIPO SÓ, então nenhum `switch`: a fila propõe vínculo, e é isso. O dia
  // que `SuggestionKind` crescer por migração, é aqui que o tipo novo entra — e
  // o `vincularEndpointAoAtivo` continua sendo quem grava.
  if (!sugestao.assetId) throw new AppError('Sugestão de vínculo sem ativo.', 422);
  await vincularEndpointAoAtivo(sugestao.endpointId, sugestao.assetId, actorId, { sugestaoId: id });

  return marcarAceita(id, actorId);
}
