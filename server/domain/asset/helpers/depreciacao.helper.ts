import { Prisma, $Enums } from '@prisma/client';
import { adicionarMeses } from './asset-dates.helper';

// O VALOR CONTÁBIL — função pura, sem I/O, e é aqui que a fórmula mora (D55).
//
// ═════════════════════════════════════════════════════════════════════════════
// POR QUE NÃO EXISTE A COLUNA `bookValue`.
//
// É a simetria exata do D16 — segunda fonte de verdade para o que
// `purchaseCost`, `purchaseDate` e a `Depreciation` já dizem — com um agravante
// que a responsabilidade derivada não tem:
//
//   a responsabilidade muda quando um EVENTO acontece;
//   o valor contábil muda quando NADA acontece.
//
// Uma coluna `bookValue` já nasce errada no dia seguinte, sem ninguém ter
// tocado em nada, e nada no sistema denunciaria isso. E calcular no navegador é
// o mesmo erro mudando de lugar: o lint impede `src/` importar de `server/`
// (eslint.config.js), então a fórmula seria escrita duas vezes — e duas
// implementações divergem na primeira regra de arredondamento.
// ═════════════════════════════════════════════════════════════════════════════

export interface RegraDeDepreciacao {
  months: number;
  floorValue: Prisma.Decimal;
  floorType: $Enums.DepreciationFloorType;
}

export interface EntradaDoValorContabil {
  purchaseCost: Prisma.Decimal | null;
  purchaseDate: Date | null;
  regra: RegraDeDepreciacao | null;
  /** Injetado pelo teste. Sem ele, "hoje" seria diferente a cada chamada. */
  agora?: Date;
}

/** Por que não há valor — a resposta honesta quando ela não é um número. */
export type MotivoSemValor = 'SEM_CUSTO' | 'SEM_REGRA' | 'SEM_DATA';

export interface ValorContabil {
  /**
   * O valor atual, como STRING (é `Decimal`), ou `null`.
   *
   * ═══════════════════════════════════════════════════════════════════════════
   * `null` NÃO É ZERO, E SOMAR OS DOIS BARATEIA A FROTA.
   *
   * São três situações e nenhuma delas vale zero: ativo sem custo de compra
   * cadastrado, modelo sem regra de depreciação, e ativo sem data de compra.
   * Tratar qualquer uma como zero faria o total do relatório dizer que o parque
   * vale menos do que vale — e é o tipo de erro que ninguém confere, porque o
   * número aparece formatado e plausível. Por isso o relatório separa os baldes.
   * ═══════════════════════════════════════════════════════════════════════════
   */
  valorAtual: string | null;
  motivo: MotivoSemValor | null;
  /** O piso em dinheiro, já resolvido de `PERCENT` para valor. */
  piso: string | null;
  mesesDecorridos: number | null;
  mesesTotais: number | null;
  /** `true` quando o ativo já chegou ao piso: não deprecia mais. */
  totalmenteDepreciado: boolean;
}

const ZERO = new Prisma.Decimal(0);
const CEM = new Prisma.Decimal(100);

/**
 * Quantos meses INTEIROS se passaram entre a compra e hoje.
 *
 * `adicionarMeses` é quem decide, e não uma divisão por 30 dias: ele já resolve o
 * transbordo de 31/01 (um mês depois é 28/02, não 03/03), e essa é a segunda
 * aritmética de datas que este projeto não escreve. A conta de calendário dá o
 * candidato; o ajuste de uma unidade corrige o caso em que o dia do mês ainda não
 * chegou.
 */
export function mesesDecorridos(de: Date, ate: Date): number {
  const candidato =
    (ate.getUTCFullYear() - de.getUTCFullYear()) * 12 + (ate.getUTCMonth() - de.getUTCMonth());

  if (candidato <= 0) return 0;

  // O dia do mês ainda não chegou: comprou em 20/01, hoje é 05/02 — passou um mês
  // de calendário e zero mês de contrato.
  return adicionarMeses(de, candidato) > ate ? candidato - 1 : candidato;
}

/** O piso em dinheiro. `PERCENT` é sobre o CUSTO, nunca sobre o valor corrente. */
export function pisoEmDinheiro(custo: Prisma.Decimal, regra: RegraDeDepreciacao): Prisma.Decimal {
  return regra.floorType === $Enums.DepreciationFloorType.PERCENT
    ? custo.mul(regra.floorValue).div(CEM)
    : regra.floorValue;
}

/**
 * `valor = min(custo, max(piso, custo − (custo − piso) × decorridos ÷ meses))`
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * OS DOIS LADOS DO CLAMP, E O `min` É O QUE QUASE FICOU DE FORA.
 *
 * O `max(piso, …)` é óbvio: o ativo não deprecia abaixo do residual. O `min`
 * parece redundante e não é — o `beforeWrite` de `depreciation.spec.ts` limita o
 * piso a 100% quando ele é `PERCENT`, mas **`AMOUNT` não tem teto nenhum**. Uma
 * regra com piso de R$ 5.000 aplicada a um mouse de R$ 50 devolve, sem o `min`,
 * um valor contábil de R$ 5.000 — um mouse que VALORIZOU no papel, e o total da
 * frota subindo a cada mouse cadastrado.
 *
 * Não é caso de borda inventado: a mesma regra de depreciação é escolhida no
 * modelo, e nada impede alguém pendurar "Notebooks — residual R$ 1.000" num
 * modelo de teclado.
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * Tudo em `Prisma.Decimal` de ponta a ponta: um `Number()` no meio reintroduz o
 * centavo que a coluna existe para impedir.
 */
export function calcularValorContabil(entrada: EntradaDoValorContabil): ValorContabil {
  const vazio = (motivo: MotivoSemValor): ValorContabil => ({
    valorAtual: null,
    motivo,
    piso: null,
    mesesDecorridos: null,
    mesesTotais: null,
    totalmenteDepreciado: false,
  });

  const { purchaseCost, purchaseDate, regra } = entrada;

  if (purchaseCost === null) return vazio('SEM_CUSTO');
  if (regra === null) return vazio('SEM_REGRA');
  if (purchaseDate === null) return vazio('SEM_DATA');

  const custo = new Prisma.Decimal(purchaseCost);
  const piso = pisoEmDinheiro(custo, regra);
  const decorridos = mesesDecorridos(purchaseDate, entrada.agora ?? new Date());

  // `months` é `Int` com mínimo 1 no schema do catálogo, mas uma linha gravada
  // antes dessa regra (ou à mão) valeria 0 — e a divisão viraria `Infinity`,
  // devolvendo `NaN` formatado como se fosse dinheiro.
  const meses = regra.months > 0 ? regra.months : 1;

  const depreciavel = custo.sub(piso);
  const perdido = depreciavel.mul(Math.min(decorridos, meses)).div(meses);

  const bruto = custo.sub(perdido);
  const comPiso = Prisma.Decimal.max(piso, bruto);
  const valor = Prisma.Decimal.min(custo, comPiso);

  return {
    // Duas casas: é dinheiro, e a coluna é `Decimal(12,2)`. Arredondar aqui — e
    // só aqui — é o que mantém a tela, o relatório e o total somando igual.
    valorAtual: valor.toDecimalPlaces(2).toString(),
    motivo: null,
    piso: Prisma.Decimal.min(custo, Prisma.Decimal.max(ZERO, piso)).toDecimalPlaces(2).toString(),
    mesesDecorridos: decorridos,
    mesesTotais: regra.months,
    totalmenteDepreciado: decorridos >= regra.months,
  };
}
