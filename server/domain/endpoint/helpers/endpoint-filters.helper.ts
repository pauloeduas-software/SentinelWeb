import type { Prisma } from '@prisma/client';

// A tela de telemetria mostra a frota inteira em cards e não tem controle de
// página: o envelope existe para a API ter UMA forma de resposta, não porque a
// tela pagina. Por isso o padrão é generoso (ver endpoint.controller.ts).

/**
 * As colunas ordenáveis.
 *
 * Chamava-se `ASSET_SORTABLE` até a F7 — nome herdado do D1, de quando `asset/`
 * era o domínio do RMM. O rename saiu junto com a primeira mexida no arquivo em
 * vez de depois, porque nome errado é copiado: a próxima fatia que precisasse de
 * uma lista dessas olharia esta para seguir o padrão.
 */
export const ENDPOINT_SORTABLE = ['hostname', 'status', 'lastSeen', 'osVersion'] as const;
export type EndpointSortable = (typeof ENDPOINT_SORTABLE)[number];

/** O que a listagem aceita filtrar além da busca por texto (F7). */
export interface FiltrosDeEndpoint {
  q?: string;
  /** `com` = já é um ativo; `sem` = órfão, o candidato a Shadow IT. */
  vinculo?: 'com' | 'sem';
  reviewState?: 'UNREVIEWED' | 'ALLOWED' | 'BLOCKED';
}

export function buildEndpointWhere(filtros: FiltrosDeEndpoint = {}): Prisma.EndpointWhereInput {
  const where: Prisma.EndpointWhereInput = {
    // MÁQUINA FUNDIDA SAI DA LISTAGEM, sempre. A linha continua no banco porque
    // o agente antigo pode voltar e porque o `ApiToken` daquela instalação
    // aponta para ela (D103) — mas ela não é mais uma máquina do parque, e
    // mostrá-la faria a mesma máquina aparecer duas vezes no painel.
    mergedIntoId: null,
  };

  if (filtros.vinculo === 'com') where.assetId = { not: null };
  if (filtros.vinculo === 'sem') where.assetId = null;
  if (filtros.reviewState) where.reviewState = filtros.reviewState;

  if (filtros.q) {
    where.OR = [
      { hostname: { contains: filtros.q, mode: 'insensitive' } },
      { osVersion: { contains: filtros.q, mode: 'insensitive' } },
      { localIp: { contains: filtros.q, mode: 'insensitive' } },
      // O serial entra na busca porque é por ele que se procura uma máquina
      // específica quando o chamado chega com a etiqueta na mão.
      { biosSerial: { contains: filtros.q, mode: 'insensitive' } },
    ];
  }

  return where;
}
