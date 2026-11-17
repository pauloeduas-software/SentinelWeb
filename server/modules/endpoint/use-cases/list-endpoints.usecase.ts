import { prisma } from '../../../infra/database/prismaClient';
import type { ListEnvelope, ListQuery } from '../../../infra/http/list-query';
import { MAQUINA_DA_LISTA_SELECT, type MaquinaDaLista } from '../helpers/present-endpoint.helper';
import { buildEndpointWhere, type FiltrosDeEndpoint } from '../helpers/endpoint-filters.helper';
import { analisarMaquina, type DicaDoVinculo, type MaquinaDoParque } from '../../reconciliation/helpers/match-cascade.helper';
import { lerParque, type Parque } from '../../reconciliation/use-cases/auto-link-endpoint.usecase';

// Máquinas descobertas pelo agente. SEM telemetria: a lista de `/agentes` não a
// mostra, e quem quer a amostra de UMA máquina usa `getEndpoint` (o porquê está
// lá). Sem ORDER BY o Postgres devolve em ordem arbitrária e as linhas trocavam
// de lugar a cada atualização do painel.

export interface DicaEAviso {
  /** O computador que o Vincular já abre escolhido, na máquina sem computador. */
  dica: { id: string; assetTag: string; sinal: DicaDoVinculo['sinal'] } | null;
  /** Por que a série não a ligou sozinha, quando ela bate com algo (DC). */
  aviso: string | null;
}

export interface MaquinaListada extends MaquinaDaLista, DicaEAviso {}

/**
 * A dica e o aviso da máquina sem computador, pela mesma regra do vínculo
 * automático: os dois nunca contradizem o que o handshake faria. A lista e a ficha
 * da máquina (DF) usam a mesma conta.
 */
export function dicaEAviso(maquina: MaquinaDoParque, parque: Parque): DicaEAviso {
  const analise = analisarMaquina(maquina, parque.ativos, parque.repetidas);
  // A que a regra ligaria e ainda não ligou (o handshake não veio desde que o
  // computador ganhou a série) aparece como dica, e não como vínculo.
  const dica = analise.dica ?? (analise.vincularA ? { ativo: analise.vincularA, sinal: 'SERIE' as const } : null);
  return {
    dica: dica && { id: dica.ativo.id, assetTag: dica.ativo.assetTag, sinal: dica.sinal },
    aviso: analise.aviso,
  };
}

export async function listEndpoints(
  query: ListQuery,
  filtros: Omit<FiltrosDeEndpoint, 'q'> = {},
): Promise<ListEnvelope<MaquinaListada>> {
  const where = buildEndpointWhere({ ...filtros, q: query.q });

  const [total, endpoints] = await prisma.$transaction([
    prisma.endpoint.count({ where }),
    prisma.endpoint.findMany({
      where,
      // `autoLinkOff` só para a regra: a resposta não o leva.
      select: { ...MAQUINA_DA_LISTA_SELECT, autoLinkOff: true },
      orderBy: { hostname: 'asc' },
      skip: query.skip,
      take: query.take,
    }),
  ]);

  // O parque só é lido quando há máquina sem computador na página.
  const parque = endpoints.some((maquina) => !maquina.asset) ? await lerParque() : null;

  const rows = endpoints.map(({ autoLinkOff, ...maquina }) => {
    if (!parque || maquina.asset) return { ...maquina, dica: null, aviso: null };
    return { ...maquina, ...dicaEAviso({ ...maquina, autoLinkOff }, parque) };
  });

  return { total, rows };
}
