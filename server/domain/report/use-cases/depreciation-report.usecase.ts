import { Prisma } from '@prisma/client';
import { prisma } from '../../../core/database/prismaClient';
import { calcularValorContabil } from '../../asset/helpers/depreciacao.helper';
import { ATIVO_NO_PARQUE } from '../helpers/report-scope.helper';

// O RELATÓRIO DE DEPRECIAÇÃO — e a decisão dele é como os `null` são tratados.
//
// ═════════════════════════════════════════════════════════════════════════════
// TRÊS BALDES, E SOMAR `null` COMO ZERO BARATEIA A FROTA.
//
// Um ativo pode não ter valor contábil por três motivos diferentes, e nenhum
// deles significa "vale zero":
//
//   SEM_CUSTO      ninguém preencheu o preço de compra
//   SEM_REGRA      o modelo não tem regra de depreciação pendurada
//   SEM_DATA       não há data de compra de onde contar
//
// Jogar os três no total com valor zero produz um número menor que o real, bem
// formatado e plausível — o tipo de erro que ninguém confere. Por isso o
// relatório CONTA cada balde e soma só o que tem valor, e a tela mostra os três
// números lado a lado: o total é uma resposta, e "43 ativos sem custo cadastrado"
// é a outra.
// ═════════════════════════════════════════════════════════════════════════════

export interface PontoDaCurva {
  /** `AAAA-MM` — o mês, que é a granularidade de uma depreciação linear. */
  mes: string;
  /** Valor contábil somado da frota naquele mês. STRING: é `Decimal`. */
  valor: string;
  /**
   * Quantos ativos o ponto soma — e ele existe para a curva não mentir sobre o
   * MOTIVO de subir.
   *
   * A frota de doze meses atrás era menor que a de hoje, então a série mistura
   * duas coisas: valor caindo por depreciação e valor subindo por compra. Sem este
   * número, uma curva ascendente parece defeito do cálculo; com ele, o hover diz
   * "eram 40 ativos, hoje são 61".
   */
  ativos: number;
}

export interface LinhaDaDepreciacao {
  assetId: string;
  assetTag: string;
  name: string | null;
  modelName: string;
  depreciationName: string | null;
  purchaseDate: Date | null;
  purchaseCost: string | null;
  valorAtual: string | null;
  motivo: string | null;
  mesesDecorridos: number | null;
  mesesTotais: number | null;
}

export interface RelatorioDeDepreciacao {
  /** Soma de `purchaseCost` da frota inteira — de quem tem custo cadastrado. */
  custoTotal: string;
  /**
   * Soma de `purchaseCost` SÓ dos ativos que têm valor contábil calculável.
   *
   * Existe para a acumulada poder ser honesta: `custoTotal` inclui quem tem preço
   * e não tem regra, e esse custo não depreciou nada.
   */
  custoDepreciavel: string;
  /** Soma do valor contábil de quem TEM os três dados. */
  valorAtualTotal: string;
  /** `custoDepreciavel − valorAtualTotal`. Nunca sobre o custo da frota inteira. */
  depreciacaoAcumulada: string;
  comValor: number;
  semCusto: number;
  semDepreciacao: number;
  semData: number;
  total: number;
  /** Doze meses para trás, para a curva do `recharts`. */
  curva: PontoDaCurva[];
  /**
   * As linhas, para a tabela abaixo do gráfico — COM TETO.
   *
   * Os totais acima varrem a frota inteira (relatório é total, e somar a página
   * daria um número que muda ao rolar). A TABELA não: uma resposta com dez mil
   * linhas são vários MB de JSON por abertura de aba, para uma tabela que ninguém
   * percorre até o fim. O teto é o de `linhasTruncadas`, e a tela diz quando
   * cortou — número truncado em silêncio é o que esta aba inteira existe para
   * evitar.
   */
  linhas: LinhaDaDepreciacao[];
  /** `true` quando `linhas` foi cortada: os totais continuam da frota inteira. */
  linhasTruncadas: boolean;
}

const ZERO = new Prisma.Decimal(0);

/** Quantos meses a curva olha para trás. Um ano é o que cabe num gráfico. */
const MESES_DA_CURVA = 12;

/** Teto da TABELA, nunca dos totais. Ver o comentário de `linhas`. */
const TETO_DE_LINHAS = 500;

const SELECT = {
  id: true,
  assetTag: true,
  name: true,
  purchaseCost: true,
  purchaseDate: true,
  model: {
    select: {
      name: true,
      depreciation: { select: { name: true, months: true, floorValue: true, floorType: true } },
    },
  },
} as const;

/**
 * O INSTANTE DE REFERÊNCIA de cada ponto da curva — o FIM de cada mês, e `agora`
 * no mês corrente.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * O ÚLTIMO PONTO TEM QUE FECHAR COM O INDICADOR AO LADO DELE.
 *
 * Esta função devolvia o PRIMEIRO dia de cada mês, e isso tinha duas
 * consequências. A visível: o último ponto era o valor no dia 1º, enquanto o
 * indicador "Valor contábil hoje" logo acima é o valor de HOJE — os dois números
 * discordavam por um mês de depreciação, no lugar onde o leitor mais naturalmente
 * os compara. A invisível é pior: com o filtro de "ainda não era patrimônio", um
 * ativo comprado no dia 15 sumia do ponto do próprio mês em que foi comprado.
 *
 * Fim de período resolve os dois: cada ponto é o valor no ÚLTIMO instante do seu
 * mês, e o mês corrente fecha em `agora`. A série passa a ser homogênea ("valor no
 * fechamento") e o último ponto é, por construção, o mesmo número do indicador.
 * ═════════════════════════════════════════════════════════════════════════════
 */
function referenciasDaCurva(quantos: number, agora: Date): Date[] {
  const refs: Date[] = [];

  // Os meses FECHADOS: dia 1º do mês seguinte menos 1 ms é o último instante do mês.
  for (let i = quantos - 1; i >= 1; i--) {
    refs.push(new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth() - i + 1, 1) - 1));
  }

  // O mês corrente não fechou: ele vale até agora.
  refs.push(agora);
  return refs;
}

export async function relatorioDeDepreciacao(agora: Date = new Date()): Promise<RelatorioDeDepreciacao> {
  // A FROTA INTEIRA numa consulta, e sem paginação: o relatório É o total. O que
  // a mantém barata é o `select` — cinco colunas do ativo e quatro da regra, sem
  // relação de posse, sem contagem, sem join de auditoria.
  const ativos = await prisma.asset.findMany({
    where: ATIVO_NO_PARQUE,
    select: SELECT,
    orderBy: { assetTag: 'asc' },
  });

  let custoTotal = ZERO;
  let custoDepreciavel = ZERO;
  let valorTotal = ZERO;
  let comValor = 0;
  let semCusto = 0;
  let semDepreciacao = 0;
  let semData = 0;

  const linhas: LinhaDaDepreciacao[] = [];

  for (const ativo of ativos) {
    const regra = ativo.model.depreciation;
    const calculo = calcularValorContabil({
      purchaseCost: ativo.purchaseCost,
      purchaseDate: ativo.purchaseDate,
      regra,
      agora,
    });

    if (ativo.purchaseCost !== null) custoTotal = custoTotal.add(ativo.purchaseCost);

    if (calculo.valorAtual !== null) {
      comValor += 1;
      valorTotal = valorTotal.add(new Prisma.Decimal(calculo.valorAtual));
      // O custo DESTE ativo entra no denominador da acumulada. Somar o custo da
      // frota inteira ali contaria como "depreciado" o preço de todo equipamento
      // que simplesmente não tem regra — um parque sem nenhuma regra cadastrada
      // apareceria 100% depreciado, que é o oposto da verdade.
      custoDepreciavel = custoDepreciavel.add(ativo.purchaseCost ?? ZERO);
    } else if (calculo.motivo === 'SEM_CUSTO') {
      semCusto += 1;
    } else if (calculo.motivo === 'SEM_REGRA') {
      semDepreciacao += 1;
    } else {
      semData += 1;
    }

    // Os acumuladores acima já contaram este ativo; a linha da tabela é o que
    // para no teto.
    if (linhas.length >= TETO_DE_LINHAS) continue;

    linhas.push({
      assetId: ativo.id,
      assetTag: ativo.assetTag,
      name: ativo.name,
      modelName: ativo.model.name,
      depreciationName: regra?.name ?? null,
      purchaseDate: ativo.purchaseDate,
      purchaseCost: ativo.purchaseCost?.toString() ?? null,
      valorAtual: calculo.valorAtual,
      motivo: calculo.motivo,
      mesesDecorridos: calculo.mesesDecorridos,
      mesesTotais: calculo.mesesTotais,
    });
  }

  // ── A CURVA ────────────────────────────────────────────────────────────────
  //
  // Doze pontos, cada um recalculando a frota com o `agora` DAQUELE mês. É a
  // mesma função pura do valor atual — a curva não pode sair de uma segunda
  // fórmula, senão o último ponto dela não fecharia com o total mostrado ao lado.
  //
  // E a série vem PRONTA do servidor (D55): calcular no navegador exigiria a
  // fórmula escrita duas vezes, e o lint impede `src/` importar de `server/`.
  //
  // SÓ OS DEPRECIÁVEIS ENTRAM NO LAÇO. Quem não tem custo, regra ou data devolve
  // `null` em todos os doze meses: filtrar uma vez troca 12 × (frota) chamadas por
  // 12 × (frota depreciável), que num parque em que a maioria dos modelos não tem
  // regra é a diferença entre o relatório abrir e o relatório travar.
  const depreciaveis = ativos.filter(
    (ativo) =>
      ativo.purchaseCost !== null
      && ativo.purchaseDate !== null
      && ativo.model.depreciation !== null,
  );

  const curva: PontoDaCurva[] = referenciasDaCurva(MESES_DA_CURVA, agora).map((referencia) => {
    let soma = ZERO;
    let quantos = 0;

    for (const ativo of depreciaveis) {
      // ═══════════════════════════════════════════════════════════════════════
      // O ATIVO AINDA NÃO ERA DA FROTA NAQUELE MÊS — e sem esta linha ele entrava
      // no ponto pelo CUSTO CHEIO.
      //
      // `calcularValorContabil` com `agora` anterior à compra dá `mesesDecorridos:
      // 0`, e zero mês decorrido é "não depreciou nada": o valor devolvido é o
      // preço de compra inteiro. Verificado — um ativo comprado em dez/2026 somava
      // R$ 1.000 no ponto de jan/2026.
      //
      // O efeito é sistemático e sempre para o mesmo lado: quanto mais compras
      // recentes, mais inflado o passado do gráfico. A curva ficava achatada
      // exatamente onde ela deveria mostrar a frota crescendo.
      // ═══════════════════════════════════════════════════════════════════════
      if (ativo.purchaseDate! > referencia) continue;

      const calculo = calcularValorContabil({
        purchaseCost: ativo.purchaseCost,
        purchaseDate: ativo.purchaseDate,
        regra: ativo.model.depreciation,
        agora: referencia,
      });

      if (calculo.valorAtual !== null) {
        soma = soma.add(new Prisma.Decimal(calculo.valorAtual));
        quantos += 1;
      }
    }

    return {
      // O rótulo é o mês da REFERÊNCIA, e ele casa nos dois casos: o último
      // instante de um mês pertence a ele, e `agora` pertence ao mês corrente.
      mes: referencia.toISOString().slice(0, 7),
      valor: soma.toDecimalPlaces(2).toString(),
      ativos: quantos,
    };
  });

  return {
    custoTotal: custoTotal.toDecimalPlaces(2).toString(),
    custoDepreciavel: custoDepreciavel.toDecimalPlaces(2).toString(),
    valorAtualTotal: valorTotal.toDecimalPlaces(2).toString(),
    // A acumulada sai do custo DEPRECIÁVEL, não do custo da frota: um ativo com
    // preço e sem regra tem custo e não tem valor contábil, e subtraí-lo aqui
    // apareceria como depreciação que nunca aconteceu.
    depreciacaoAcumulada: custoDepreciavel.sub(valorTotal).toDecimalPlaces(2).toString(),
    comValor,
    semCusto,
    semDepreciacao,
    semData,
    total: ativos.length,
    curva,
    linhas,
    linhasTruncadas: ativos.length > linhas.length,
  };
}
