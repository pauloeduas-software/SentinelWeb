import type { ReconciliationSuggestion } from '@prisma/client';
import { prisma } from '../../../infra/database/prismaClient';
import type { Ator } from '../../audit/audit.types';
import { AppError } from '../../../infra/errors/app-error';
import { SUGGESTION_SELECT } from '../helpers/suggestion-select.helper';
import { vincularEndpointAoAtivo } from './link-endpoint-asset.usecase';

// "Sim." — e é aqui que a sugestão vira CADASTRO.
//
// ─────────────────────────────────────────────────────────────────────────────
// A REGRA: nada aqui escreve direto.
//
// Aceitar chama o `vincularEndpointAoAtivo`, que já carrega o `AuditLog` e o
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

/**
 * Executa o que a sugestão propõe.
 *
 * O fechamento vai DENTRO do vínculo (`origem.sugestaoId`), na mesma transação
 * que o grava: a sugestão vira `ACCEPTED` junto com a máquina ligada ao ativo,
 * ou nada acontece. Separados, o vínculo encerrava esta sugestão como
 * `SUPERSEDED` com as outras, e uma falha antes do fechamento a deixava assim
 * — e o expurgo a apagava na rodada seguinte.
 */
export async function aceitarSugestao(id: string, ator: Ator) {
  const sugestao = await carregarPendente(id);

  // UM TIPO SÓ, então nenhum `switch`: a fila propõe vínculo, e é isso. O dia
  // que `SuggestionKind` crescer por migração, é aqui que o tipo novo entra — e
  // o `vincularEndpointAoAtivo` continua sendo quem grava.
  if (!sugestao.assetId) throw new AppError('Sugestão de vínculo sem ativo.', 422);
  await vincularEndpointAoAtivo(sugestao.endpointId, sugestao.assetId, ator, { sugestaoId: id });

  return prisma.reconciliationSuggestion.findUniqueOrThrow({ where: { id }, select: SUGGESTION_SELECT });
}
