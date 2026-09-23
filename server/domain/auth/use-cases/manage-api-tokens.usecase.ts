import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { recordActivity } from '../../activity/use-cases/record-activity.usecase';
import { gerarApiToken } from '../helpers/api-token.helper';

// EMITIR, LISTAR E REVOGAR token de agente.
//
// `tokenHash` NUNCA sai daqui, em nenhuma resposta: ele é o que prova a posse
// do token, e devolvê-lo na listagem tornaria o hash inútil — qualquer operador
// poderia gravá-lo e autenticar como a máquina.
const API_TOKEN_SELECT = {
  id: true,
  name: true,
  ownerType: true,
  endpointId: true,
  prefix: true,
  lastUsedAt: true,
  revokedAt: true,
  createdAt: true,
  createdById: true,
} as const;

export async function listAgentTokens() {
  return prisma.apiToken.findMany({
    where: { ownerType: 'AGENT' },
    select: API_TOKEN_SELECT,
    // Revogados por último: a lista é de trabalho, e o que está em uso importa.
    orderBy: [{ revokedAt: { sort: 'asc', nulls: 'first' } }, { createdAt: 'desc' }],
  });
}

/**
 * Emite um token novo.
 *
 * O SEGREDO É DEVOLVIDO UMA VEZ E NUNCA MAIS. Não há rota para relê-lo, e isso
 * é a garantia inteira: só o sha256 fica no banco, então nem quem lê o dump
 * consegue autenticar. Perder o token significa emitir outro — que é barato — e
 * não há caminho para "recuperar", porque um caminho desses seria exatamente o
 * que o hash existe para impedir.
 */
export async function issueAgentToken(name: string, actorId: string | null) {
  const { token, prefix, tokenHash } = gerarApiToken();

  const criado = await prisma.$transaction(async (tx) => {
    const linha = await tx.apiToken.create({
      data: {
        name,
        ownerType: 'AGENT',
        prefix,
        tokenHash,
        createdById: actorId,
        // `endpointId` nasce NULO: a máquina ainda não existe no sistema (D80).
      },
      select: API_TOKEN_SELECT,
    });

    // O `changes` guarda o PREFIXO, nunca o segredo nem o hash — um
    // `ActivityLog` é lido por mais gente do que o banco e guarda para sempre.
    await recordActivity(tx, {
      entityType: 'ApiToken',
      entityId: linha.id,
      action: 'CREATE',
      changes: { name, prefix, ownerType: 'AGENT' },
    }, actorId);

    return linha;
  });

  return { ...criado, token };
}

/**
 * Revoga. Não apaga.
 *
 * `revokedAt` em vez de `DELETE` pelo mesmo motivo do `checkinAt`: "qual token
 * esta máquina usava em março?" precisa continuar respondível, e um token
 * apagado leva junto o `lastUsedAt` que diria se ele chegou a ser usado depois
 * de vazar.
 */
export async function revokeAgentToken(id: string, actorId: string | null) {
  const token = await prisma.apiToken.findUnique({
    where: { id },
    select: { id: true, name: true, prefix: true, revokedAt: true },
  });
  if (!token) throw new AppError('Token não encontrado.', 404);
  if (token.revokedAt) throw new AppError('Este token já foi revogado.', 409);

  return prisma.$transaction(async (tx) => {
    const { count } = await tx.apiToken.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (count === 0) throw new AppError('Este token já foi revogado.', 409);

    await recordActivity(tx, {
      entityType: 'ApiToken',
      entityId: id,
      action: 'REVOKE',
      changes: { name: token.name, prefix: token.prefix },
    }, actorId);

    return tx.apiToken.findUniqueOrThrow({ where: { id }, select: API_TOKEN_SELECT });
  });
}
