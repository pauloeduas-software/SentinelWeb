import { Prisma } from '@prisma/client';
import { prisma } from '../../../core/database/prismaClient';
import { ATIVO_NO_PARQUE_SQL, ATIVO_VIVO_SQL } from '../../asset/helpers/asset-scope.helper';

// O QUE CADA PESSOA RESPONDE — direto × por posto (F10, Etapa F).
//
// ═════════════════════════════════════════════════════════════════════════════
// É O ÚNICO DOS TRÊS RELATÓRIOS "QUE SÓ EXISTEM AQUI" QUE DE FATO FALTAVA.
//
// O plano da fase listava três — *posto vago*, *ativos por posto* e este — como
// saídas da view. A execução encontrou que os dois primeiros JÁ ESTAVAM
// RESPONDIDOS desde a F4/F7, e por quem deve respondê-los:
//
//   `GET /api/workstations?view=vagos`  é o posto vago, com a definição que
//                                       `ehPostoVago()` guarda (D130 — não
//                                       criar a terceira);
//   `GET /api/workstations`             traz `totalAtivos` e `totalOcupantes`
//                                       por posto, que é "ativos por posto".
//
// Este não tem como sair de lá: ele agrega por PESSOA, atravessando a frota
// inteira, e a pergunta "a Laura responde por quantos equipamentos, e por quais
// caminhos?" não cabe numa tela de postos nem numa página de 25 ativos. É
// exatamente o caso que o D66 descreve: *não dá para agrupar por responsável
// aquilo que não foi buscado*.
//
// AS TRÊS COLUNAS SÃO FATOS DIFERENTES, e separá-las é o ponto:
//
//   DIRETO  a posse é da pessoa. Desfaz-se com uma devolução.
//   POSTO   a pessoa ocupa a mesa a que o equipamento foi entregue. Desfaz-se
//           com uma troca de escala — e ela responde JUNTO com os outros
//           ocupantes, solidariamente.
//   ATIVO   o equipamento está preso a outro equipamento que é dela (a dock que
//           segura o notebook).
//
// Somar os três numa coluna só esconderia a única informação que importa na
// hora de cobrar devolução: o que sai com a pessoa e o que fica na mesa.
//
// POR QUE A PESSOA NA LIXEIRA APARECE AQUI (e isso NÃO é descuido): é o mesmo
// `INCLUINDO_LIXEIRA` do `resolverResponsaveisEmLote`. Filtrada, um colaborador
// desligado com o notebook na mão desapareceria do relatório — e é justamente
// esse o equipamento que ninguém quer perder de vista. A coluna `desligado`
// existe para ele aparecer COM a marca, que é a pendência de checkin que ele é.
// ═════════════════════════════════════════════════════════════════════════════

export interface LinhaDeResponsabilidade {
  userId: string;
  name: string;
  email: string;
  /** Fora de operação: desligado ou na lixeira. É pendência de devolução. */
  desligado: boolean;
  diretos: number;
  porPosto: number;
  porAtivo: number;
  /** `COUNT(DISTINCT)`: o ativo não é contado duas vezes. */
  total: number;
  /** Soma do custo de compra do que ela responde. STRING: é `Decimal`. */
  custoTotal: string | null;
}

export interface RelatorioDeResponsabilidade {
  linhas: LinhaDeResponsabilidade[];
  /** Quantos ativos do parque NÃO têm ninguém respondendo por eles. */
  semResponsavel: number;
  /** Quantas pessoas fora de operação ainda respondem por equipamento. */
  desligadosComPosse: number;
}

export async function responsibilityReport(
  /** A sessão enxerga custo? (F11, D77). Por parâmetro, como nos outros. */
  podeVerCusto: boolean,
): Promise<RelatorioDeResponsabilidade> {
  // O `SUM` do custo só existe com a chave: `NULL::numeric` no lugar, e o valor
  // não é lido do banco em vez de ser apagado depois. A forma da resposta não
  // muda — `custoTotal` já podia vir nulo para quem só responde por ativo sem
  // custo cadastrado —, então nenhuma tela precisa mudar para tratar isto.
  //
  // O relatório CONTINUA ÚTIL sem a chave: ele responde "quem responde por
  // quantos equipamentos", que é a pergunta principal. O custo é a coluna que
  // alguns veem.
  const somaDoCusto = podeVerCusto ? Prisma.sql`SUM(a."purchaseCost")` : Prisma.sql`NULL::numeric`;
  const linhas = await prisma.$queryRaw<(Omit<LinhaDeResponsabilidade, 'custoTotal'> & {
    custoTotal: unknown;
  })[]>(Prisma.sql`
    SELECT r."userId",
           u.name,
           u.email,
           (u."deletedAt" IS NOT NULL OR u."isActive" = false) AS desligado,
           COUNT(DISTINCT CASE WHEN r.via = 'DIRETO' THEN r."assetId" END)::int AS diretos,
           COUNT(DISTINCT CASE WHEN r.via = 'POSTO'  THEN r."assetId" END)::int AS "porPosto",
           COUNT(DISTINCT CASE WHEN r.via = 'ATIVO'  THEN r."assetId" END)::int AS "porAtivo",
           COUNT(DISTINCT r."assetId")::int AS total,
           ${somaDoCusto} AS "custoTotal"
      FROM vw_asset_responsibles r
      JOIN assets a ON a.id = r."assetId"
      JOIN status_labels s ON s.id = a."statusId"
      JOIN users u ON u.id = r."userId"
     WHERE ${ATIVO_VIVO_SQL} AND ${ATIVO_NO_PARQUE_SQL}
     GROUP BY r."userId", u.name, u.email, u."deletedAt", u."isActive"
     ORDER BY total DESC, u.name ASC
  `);

  // SEM RESPONSÁVEL: o ativo do parque que não aparece na view. É o complemento
  // do relatório, e a pergunta que ele responde é outra — "o que está no
  // estoque ou numa mesa vazia?".
  //
  // `NOT EXISTS` e não `LEFT JOIN … IS NULL`: com a view multiplicando linhas, o
  // `LEFT JOIN` exigiria `DISTINCT` para não contar o mesmo ativo duas vezes.
  const [{ total: semResponsavel }] = await prisma.$queryRaw<{ total: number }[]>(Prisma.sql`
    SELECT COUNT(*)::int AS total
      FROM assets a
      JOIN status_labels s ON s.id = a."statusId"
     WHERE ${ATIVO_VIVO_SQL} AND ${ATIVO_NO_PARQUE_SQL}
       AND NOT EXISTS (SELECT 1 FROM vw_asset_responsibles r WHERE r."assetId" = a.id)
  `);

  return {
    linhas: linhas.map((linha) => ({
      ...linha,
      custoTotal: linha.custoTotal === null ? null : String(linha.custoTotal),
    })),
    semResponsavel,
    desligadosComPosse: linhas.filter((linha) => linha.desligado).length,
  };
}
