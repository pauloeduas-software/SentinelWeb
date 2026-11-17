import type { Prisma } from '@prisma/client';
import { contemTexto } from '../../shared/busca.helper';

// `/agentes` lê a frota inteira de uma vez e não tem controle de página: o
// envelope existe para a API ter UMA forma de resposta, não porque a tela pagina.
// Por isso o padrão é generoso (ver endpoint.controller.ts).

/**
 * O prazo fixo dos sumidos, como o "missing" do Fleet (30 dias, em
 * `server/datastore/mysql/hosts.go`). Era configurável, e a tela de configuração
 * saiu com a DC: um número que só explicava outro número não pedia tela.
 */
export const DIAS_SEM_CONTATO = 30;

/** Antes disto, o último contato faz a máquina sumida. */
export function limiteDeSumido(): Date {
  return new Date(Date.now() - DIAS_SEM_CONTATO * 24 * 60 * 60 * 1000);
}

/** O que a listagem aceita filtrar além da busca por texto. */
export interface FiltrosDeEndpoint {
  q?: string;
  /**
   * As três vistas de Agentes, que não se sobrepõem (DD): `com` já é um
   * computador, `sem` o cadastro ainda não conhece, e `sumidos` não dá sinal há
   * mais de `DIAS_SEM_CONTATO`, com computador ou sem. A sumida sai das outras
   * duas, como o baixado sai de Ativos em Computadores.
   */
  vista?: 'com' | 'sem' | 'sumidos';
}

export function buildEndpointWhere(filtros: FiltrosDeEndpoint = {}): Prisma.EndpointWhereInput {
  const where: Prisma.EndpointWhereInput = {};

  if (filtros.vista === 'sumidos') where.lastSeen = { lt: limiteDeSumido() };
  if (filtros.vista === 'com') Object.assign(where, { assetId: { not: null }, lastSeen: { gte: limiteDeSumido() } });
  if (filtros.vista === 'sem') Object.assign(where, { assetId: null, lastSeen: { gte: limiteDeSumido() } });

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
