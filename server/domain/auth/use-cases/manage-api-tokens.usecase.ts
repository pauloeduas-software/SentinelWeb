import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { recordActivity } from '../../activity/use-cases/record-activity.usecase';
import { gerarApiToken } from '../helpers/api-token.helper';

// EMITIR, LISTAR E REVOGAR token de API — do AGENTE e da PESSOA (F11, Etapa H).
//
// ═════════════════════════════════════════════════════════════════════════════
// UM ARQUIVO PARA OS DOIS DONOS, PARAMETRIZADO PELO ESCOPO.
//
// O D80 escolheu um caminho de token só e um `ownerType` para distinguir os
// donos; este arquivo era a metade que ainda não tinha sido generalizada —
// `where: { ownerType: 'AGENT' }` escrito em três lugares. A auditoria da F11
// apontou isso (defeito 6) e também onde ele NÃO deve morar: `access/`. Token é
// credencial, e credencial é `auth/` — o que o `access/` decide é o que uma chave
// alcança, não como alguém prova quem é.
//
// O `EscopoDeToken` é um tipo-união em vez de dois parâmetros soltos porque é ele
// que torna impossível emitir um token `USER` sem dono, ou um `AGENT` com dono:
// as duas combinações não existem no tipo.
//
// E ELE ENTRA TAMBÉM NO `where` DE REVOGAR, que é a parte que importa para a
// segurança: `POST /api/me/tokens/:id/revoke` recebe um id do cliente, e sem o
// escopo no filtro qualquer pessoa logada revogaria o token de qualquer outra —
// ou os da frota de agentes — mandando um id que não é dela.
// ═════════════════════════════════════════════════════════════════════════════

export type EscopoDeToken =
  | { ownerType: 'AGENT' }
  | { ownerType: 'USER'; userId: string };

/**
 * O `where` do escopo, num lugar só.
 *
 * `userId: undefined` NÃO serve para o caso AGENT: no Prisma, `undefined` em
 * filtro significa "não filtre por esta coluna", então um token pessoal
 * apareceria na lista do agente. Tem de ser `null` explícito.
 */
function filtroDoEscopo(escopo: EscopoDeToken) {
  return escopo.ownerType === 'AGENT'
    ? { ownerType: 'AGENT' as const, userId: null }
    : { ownerType: 'USER' as const, userId: escopo.userId };
}

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

export async function listApiTokens(escopo: EscopoDeToken) {
  return prisma.apiToken.findMany({
    where: filtroDoEscopo(escopo),
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
export async function issueApiToken(name: string, escopo: EscopoDeToken, actorId: string | null) {
  const { token, prefix, tokenHash } = gerarApiToken();

  const criado = await prisma.$transaction(async (tx) => {
    const linha = await tx.apiToken.create({
      data: {
        name,
        ...filtroDoEscopo(escopo),
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
      changes: { name, prefix, ownerType: escopo.ownerType },
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
 *
 * O ESCOPO ENTRA NO `findFirst` E NO `updateMany`: o 404 de "não é seu" é o
 * mesmo de "não existe", de propósito — responder 403 para o token de outra
 * pessoa confirmaria que aquele id existe.
 */
export async function revokeApiToken(id: string, escopo: EscopoDeToken, actorId: string | null) {
  const where = { id, ...filtroDoEscopo(escopo) };

  const token = await prisma.apiToken.findFirst({
    where,
    select: { id: true, name: true, prefix: true, revokedAt: true },
  });
  if (!token) throw new AppError('Token não encontrado.', 404);
  if (token.revokedAt) throw new AppError('Este token já foi revogado.', 409);

  return prisma.$transaction(async (tx) => {
    const { count } = await tx.apiToken.updateMany({
      where: { ...where, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (count === 0) throw new AppError('Este token já foi revogado.', 409);

    await recordActivity(tx, {
      entityType: 'ApiToken',
      entityId: id,
      action: 'REVOKE',
      changes: { name: token.name, prefix: token.prefix, ownerType: escopo.ownerType },
    }, actorId);

    return tx.apiToken.findUniqueOrThrow({ where: { id }, select: API_TOKEN_SELECT });
  });
}
