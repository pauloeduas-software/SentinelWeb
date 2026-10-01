import { Prisma } from '@prisma/client';
import { prisma } from '../../../core/database/prismaClient';
import {
  ESCOPO_DO_RELATORIO, REPORT_TOKENS, baseDoRelatorio, colunaDeAgrupamento, coluna,
  selectDasColunas,
} from '../helpers/report-columns';

// O RELATÓRIO MONTADO PELO USUÁRIO (F10, Etapa F — D67).
//
// ═════════════════════════════════════════════════════════════════════════════
// POR QUE ELE É `$queryRaw`, QUANDO O RESTO DO SISTEMA É PRISMA TIPADO.
//
// Porque metade do valor dele está em `vw_asset_responsibles`, e a view NÃO
// EXISTE no schema do Prisma (D66) — nenhum `select` tipado a alcança. E porque
// agrupar por responsável resolvido é impossível em memória: não dá para
// agrupar o que não foi buscado, e buscar a frota inteira para agrupar na
// aplicação é o que o teto de `perPage` existe para impedir.
//
// O SQL CRU FICA CONFINADO: toda expressão vem de `report-columns.ts`, nenhuma
// vem da requisição. O cliente manda token.
//
// DOIS MODOS, e o segundo é a razão de existir:
//
//   sem `agruparPor`  → uma linha por (ativo × responsável). O `LEFT JOIN` com
//                       a view multiplica de propósito: um ativo de posto com
//                       duas pessoas aparece duas vezes, uma por responsável.
//
//   com `agruparPor`  → `COUNT(DISTINCT ativo)` e a soma do custo por grupo. O
//                       `DISTINCT` é o que impede o ativo de posto compartilhado
//                       ser contado duas vezes num agrupamento por categoria.
// ═════════════════════════════════════════════════════════════════════════════

/** Teto da listagem. Quem quer o arquivo inteiro usa o export (Etapa C). */
const MAX_LINHAS = 2_000;
const LINHAS_PADRAO = 200;

/** Teto de grupos. Acima disto o resultado é uma listagem com outro nome. */
const MAX_GRUPOS = 500;

export interface PedidoDeRelatorio {
  columns: string[];
  agruparPor?: string;
  limit?: number;
}

export interface LinhaDeRelatorio {
  [token: string]: unknown;
}

export interface GrupoDeRelatorio {
  grupo: string | null;
  ativos: number;
  /** Soma do custo de compra do grupo. STRING, porque é `Decimal` no banco. */
  custoTotal: string | null;
}

export interface RespostaDoRelatorio {
  /** Os tokens pedidos, na ordem — é com eles que a tela monta o cabeçalho. */
  columns: { token: string; rotulo: string }[];
  agruparPor: string | null;
  linhas: LinhaDeRelatorio[];
  grupos: GrupoDeRelatorio[];
  /** O que o builder aceita, para a tela montar o seletor sem adivinhar. */
  disponiveis: string[];
}

export async function customReport(pedido: PedidoDeRelatorio): Promise<RespostaDoRelatorio> {
  const limite = Math.min(Math.max(pedido.limit ?? LINHAS_PADRAO, 1), MAX_LINHAS);

  // A validação acontece ANTES de qualquer consulta: token inválido é 422 com a
  // lista, e não um erro de SQL.
  const select = selectDasColunas(pedido.columns);
  const colunas = pedido.columns.map((token) => ({ token, rotulo: coluna(token).rotulo }));

  if (pedido.agruparPor) {
    const agrupamento = colunaDeAgrupamento(pedido.agruparPor);

    // O `DISTINCT` TEM DE VIR ANTES DE SOMAR, E NÃO SÓ ANTES DE CONTAR.
    //
    // O `LEFT JOIN` com a view MULTIPLICA linhas de propósito (um ativo entregue
    // a um posto com duas pessoas aparece duas vezes, uma por responsável). O
    // `COUNT(DISTINCT a.id)` dava conta disso; o `SUM(a."purchaseCost")` ao lado
    // NÃO — ele somava o custo do mesmo equipamento uma vez por responsável, e o
    // total do relatório fechava maior que a soma real do parque. O erro cresce
    // com o uso do modelo de posse: quanto mais mesa compartilhada, mais inflado.
    //
    // `SUM(DISTINCT …)` seria pior ainda: ele descartaria dois ativos de MESMO
    // preço. A deduplicação certa é por (ativo, grupo) — a mesma granularidade
    // que o `COUNT(DISTINCT a.id)` já tinha —, e é o que a subconsulta faz. Daí
    // o `COUNT(*)` de fora ser idêntico ao `COUNT(DISTINCT)` de antes.
    const grupos = await prisma.$queryRaw<GrupoDeRelatorio[]>(Prisma.sql`
      SELECT grupo,
             COUNT(*)::int AS ativos,
             SUM("custoDoAtivo") AS "custoTotal"
        FROM (
          SELECT DISTINCT a.id AS "assetId",
                 ${agrupamento.expr} AS grupo,
                 a."purchaseCost" AS "custoDoAtivo"
            ${baseDoRelatorio()}
            ${ESCOPO_DO_RELATORIO}
        ) AS "umaLinhaPorAtivoEGrupo"
       GROUP BY grupo
       -- O grupo entra como desempate: sem ele, dois grupos com a mesma contagem
       -- trocam de lugar entre duas execuções idênticas, e a tela parece instável.
       ORDER BY ativos DESC, grupo ASC
       LIMIT ${MAX_GRUPOS}
    `);

    return {
      columns: colunas,
      agruparPor: pedido.agruparPor,
      linhas: [],
      // `Decimal` sai do driver como objeto; a resposta JSON leva string, que é
      // o contrato de toda coluna de dinheiro deste sistema.
      grupos: grupos.map((grupo) => ({
        ...grupo,
        custoTotal: grupo.custoTotal === null ? null : String(grupo.custoTotal),
      })),
      disponiveis: REPORT_TOKENS,
    };
  }

  const linhas = await prisma.$queryRaw<LinhaDeRelatorio[]>(Prisma.sql`
    SELECT ${select}
      ${baseDoRelatorio()}
      ${ESCOPO_DO_RELATORIO}
     ORDER BY a."assetTag" ASC
     LIMIT ${limite}
  `);

  return {
    columns: colunas,
    agruparPor: null,
    // Dinheiro e data saem do driver como objeto; a resposta JSON precisa de
    // string em dinheiro (o contrato do sistema) e o `Date` o Fastify serializa
    // em ISO sozinho.
    linhas: linhas.map((linha) => {
      const convertida: LinhaDeRelatorio = { ...linha };
      if (convertida.purchaseCost !== null && convertida.purchaseCost !== undefined) {
        convertida.purchaseCost = String(convertida.purchaseCost);
      }
      return convertida;
    }),
    grupos: [],
    disponiveis: REPORT_TOKENS,
  };
}
