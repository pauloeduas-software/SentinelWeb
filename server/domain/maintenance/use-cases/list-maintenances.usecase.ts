import { Prisma } from '@prisma/client';
import { prisma } from '../../../core/database/prismaClient';
import type { ListEnvelope, ListQuery } from '../../../core/http/list-query';
import {
  buildMaintenanceFilterWhere, buildMaintenanceWhere, type MaintenanceFilters,
} from '../helpers/maintenance-filters.helper';
import {
  MAINTENANCE_SELECT, paraResposta,
  type LinhaDeManutencao, type ManutencaoNaResposta,
} from '../helpers/maintenance-select.helper';

/**
 * O resumo do cabeçalho: custo acumulado e quantas estão em aberto.
 *
 * Ele acompanha a listagem em vez de ter rota própria porque responde ao MESMO
 * recorte: filtrar por `REPARO` e ver o custo total de todas as manutenções seria
 * um número que não fala da tela que está na frente.
 */
export interface ResumoDaListagem {
  /** Soma de `cost` das linhas do recorte. STRING, porque é `Decimal`. */
  custoTotal: string;
  /** Quantas do recorte estão sem `completionDate`. */
  emAberto: number;
  /** Quantas saíram na garantia — o número que uma renovação de contrato pede. */
  naGarantia: number;
}

export interface ListaDeManutencoes extends ListEnvelope<ManutencaoNaResposta> {
  resumo: ResumoDaListagem;
}

/**
 * A TELA GLOBAL — e os totais são `aggregate` FORA do `skip`/`take`.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * SOMAR A PÁGINA NÃO É SOMAR O RECORTE.
 *
 * Com 40 manutenções e `perPage: 15`, somar `rows` no cliente daria o custo de
 * quinze delas — um número plausível, errado, e que MUDA ao virar a página. O
 * `aggregate` roda sobre o mesmo `where` sem paginação nenhuma, então o
 * cabeçalho diz a verdade sobre o filtro e não sobre a janela.
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * `custoTotal` sai como STRING: `_sum.cost` é `Decimal`, e `Number()` aqui
 * reintroduziria o centavo que a coluna existe para impedir. Quem formata é a
 * tela.
 */
export async function listMaintenances(
  query: ListQuery<string>,
  filtros: MaintenanceFilters,
): Promise<ListaDeManutencoes> {
  // Espalhamento, e não `AND`: a busca só escreve `OR` e os filtros só escrevem
  // colunas — nenhuma chave dos dois lados se repete.
  const where: Prisma.MaintenanceWhereInput = {
    ...buildMaintenanceWhere(query.q),
    ...buildMaintenanceFilterWhere(filtros),
  };

  // `$transaction` para o total e a página saírem do MESMO instante: em consultas
  // soltas, um cadastro entre uma e outra faz o total não bater com o que a
  // página mostra.
  const { total, rows, soma, emAberto, naGarantia } = await prisma.$transaction(async (tx) => ({
    total: await tx.maintenance.count({ where }),
    rows: await tx.maintenance.findMany({
      where,
      select: MAINTENANCE_SELECT,
      orderBy: { [query.sort]: query.order },
      skip: query.skip,
      take: query.take,
    }) as LinhaDeManutencao[],
    soma: await tx.maintenance.aggregate({ where, _sum: { cost: true } }),
    emAberto: await tx.maintenance.count({ where: { ...where, completionDate: null } }),
    naGarantia: await tx.maintenance.count({ where: { ...where, isWarranty: true } }),
  }));

  // `agora` fixado UMA vez para a página inteira: derivar `diasEmAberto` linha a
  // linha com `new Date()` faria duas linhas da mesma resposta usarem instantes
  // diferentes — inofensivo hoje, e o tipo de coisa que fica estranha na virada
  // do dia.
  const agora = new Date();

  return {
    total,
    rows: rows.map((linha) => paraResposta(linha, agora)),
    resumo: {
      custoTotal: (soma._sum.cost ?? new Prisma.Decimal(0)).toString(),
      emAberto,
      naGarantia,
    },
  };
}
