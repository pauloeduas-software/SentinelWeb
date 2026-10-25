import type { Prisma } from '@prisma/client';
import { contemTexto } from '../../shared/busca.helper';

// `/descobertas` lê a frota inteira de uma vez e não tem controle de página: o
// envelope existe para a API ter UMA forma de resposta, não porque a tela pagina.
// Por isso o padrão é generoso (ver endpoint.controller.ts).

/** O que a listagem aceita filtrar além da busca por texto (F7). */
export interface FiltrosDeEndpoint {
  q?: string;
  /** `com` = já é um ativo; `sem` = órfão, o candidato a Shadow IT. */
  vinculo?: 'com' | 'sem';
}

export function buildEndpointWhere(filtros: FiltrosDeEndpoint = {}): Prisma.EndpointWhereInput {
  const where: Prisma.EndpointWhereInput = {};

  if (filtros.vinculo === 'com') where.assetId = { not: null };
  if (filtros.vinculo === 'sem') where.assetId = null;

  if (filtros.q) {
    where.OR = [
      { hostname: contemTexto(filtros.q) },
      { osVersion: contemTexto(filtros.q) },
      { localIp: contemTexto(filtros.q) },
      // O serial entra na busca porque é por ele que se procura uma máquina
      // específica quando o chamado chega com a etiqueta na mão.
      { biosSerial: contemTexto(filtros.q) },
    ];
  }

  return where;
}
