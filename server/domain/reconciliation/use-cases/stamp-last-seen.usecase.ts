import { prisma } from '../../../core/database/prismaClient';

/**
 * Carimba `Asset.lastSeenByAgentAt` a partir do batimento das máquinas vinculadas.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUE AQUI, E NÃO NO `touchEndpoint` — o D95
 *
 * O plano da fase dizia "escrita no handshake, no máximo uma vez por dia". A
 * árvore mostrou o custo: `touchEndpoint` roda a cada Handshake, Telemetry e
 * Ping de CADA máquina. O teto diário não evita esse custo, só evita a escrita —
 * a instrução condicional seria EXECUTADA em toda mensagem de qualquer jeito, e
 * são máquinas × mensagens por dia de `UPDATE` que quase nunca casa.
 *
 * Pior que o custo: acoplar a tabela de patrimônio ao caminho de ingestão. Um
 * lock em `assets` (um `bulk-update` rodando na tela de ativos) passaria a poder
 * atrasar o batimento do RMM — e um batimento atrasado é o `zombie-cleaner`
 * marcando máquinas vivas como OFFLINE.
 *
 * A precisão perdida é de uma hora. A pergunta que a coluna responde é "não é
 * visto há quantos DIAS?" (`ghostDays`, padrão 30). Uma coluna com até uma hora
 * de atraso responde isso exatamente igual.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * UMA instrução para a frota inteira, e não um `update` por ativo: com 500
 * máquinas vinculadas, o laço seriam 500 viagens ao banco de hora em hora para
 * copiar uma data.
 *
 * O `AND` no fim é o que torna a instrução idempotente e barata: linha cujo
 * carimbo já está em dia não é reescrita, então o `UPDATE` não suja páginas à
 * toa nem infla o autovacuum.
 */
export async function carimbarUltimoContatoNosAtivos(): Promise<number> {
  return prisma.$executeRaw`
    UPDATE "assets" a
       SET "lastSeenByAgentAt" = e."lastSeen"
      FROM "endpoints" e
     WHERE e."assetId" = a."id"
       AND e."mergedIntoId" IS NULL
       AND (a."lastSeenByAgentAt" IS NULL OR a."lastSeenByAgentAt" < e."lastSeen")
  `;
}
