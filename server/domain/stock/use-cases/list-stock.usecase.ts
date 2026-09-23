import { prisma } from '../../../core/database/prismaClient';
import type { ListEnvelope, ListQuery } from '../../../core/http/list-query';
import { comSaldo, contarEmUso, type ComSaldo } from '../helpers/stock-balance.helper';
import { buildStockViewWhere, buildStockWhere } from '../helpers/stock-filters.helper';
import type { StockKindSpec } from '../helpers/stock-kind.helper';

/** A linha crua do banco, do ponto de vista do saldo. */
export interface ItemDeEstoque extends Record<string, unknown> {
  id: string;
  qty: number;
  minQty: number | null;
}

export type ItemComSaldo = ComSaldo<ItemDeEstoque>;

/**
 * A listagem dos três tipos — UMA implementação, três rotas.
 *
 * A COLUNA PRINCIPAL DESTA TELA É DERIVADA (`disponivel / qty`), e é por isso
 * que esta listagem não cabe no motor de specs do catálogo: o `select` de lá é
 * allowlist estática, e ensiná-lo a calcular saldo seria dobrar um genérico
 * para atender três clientes (D35).
 */
export async function listStock(
  spec: StockKindSpec,
  query: ListQuery<string>,
): Promise<ListEnvelope<ItemComSaldo>> {
  // Espalhamento, e não `AND`: a busca só escreve `OR` e a vista só escreve
  // `deletedAt` — nenhuma chave dos dois lados se repete.
  const where = { ...buildStockWhere(spec, query.q), ...buildStockViewWhere(query.view) };

  // `$transaction` para a contagem e a página saírem do MESMO instante: em duas
  // consultas soltas, um cadastro entre uma e outra faz o total não bater com o
  // que a página mostra.
  //
  // A forma de CALLBACK, e não a de array: o array exige `PrismaPromise`, que o
  // `StockDelegate` não devolve — ele é a interface mínima que o cast de cada
  // spec produz (`stock-kind.helper.ts`). O custo é as duas consultas saírem em
  // sequência dentro da transação, em vez de no mesmo lote; a garantia que
  // importa — as duas verem o mesmo instante — é da transação, não do lote.
  const { total, rows } = await prisma.$transaction(async (tx) => {
    const delegate = spec.delegate(tx);
    return {
      total: await delegate.count({ where }),
      rows: await delegate.findMany({
        where,
        select: spec.select,
        orderBy: { [query.sort]: query.order },
        skip: query.skip,
        take: query.take,
      }) as ItemDeEstoque[],
    };
  });

  // O SALDO, em lote e FORA da transação acima. Fora de propósito: aquela
  // existe para o total e a página serem do mesmo instante, e alongá-la com a
  // contagem das saídas seguraria a transação durante leitura que não precisa
  // dessa garantia — a mesma escolha que `listAssets` faz com a resolução de
  // responsáveis.
  const emUso = await contarEmUso(prisma, spec.kind, rows.map((linha) => linha.id));

  return {
    total,
    rows: rows.map((linha) => comSaldo(linha, emUso.get(linha.id) ?? 0)),
  };
}
