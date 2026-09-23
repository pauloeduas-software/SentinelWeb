import type { Prisma } from '@prisma/client';

// A tela de telemetria mostra a frota inteira em cards e não tem controle de
// página: o envelope existe para a API ter UMA forma de resposta, não porque a
// tela pagina. Por isso o padrão é generoso (ver endpoint.controller.ts).
export const ASSET_SORTABLE = ['hostname', 'status', 'lastSeen', 'osVersion'] as const;
export type EndpointSortable = (typeof ASSET_SORTABLE)[number];

export function buildEndpointWhere(q?: string): Prisma.EndpointWhereInput {
  if (!q) return {};

  return {
    OR: [
      { hostname: { contains: q, mode: 'insensitive' } },
      { osVersion: { contains: q, mode: 'insensitive' } },
      { localIp: { contains: q, mode: 'insensitive' } },
    ],
  };
}
