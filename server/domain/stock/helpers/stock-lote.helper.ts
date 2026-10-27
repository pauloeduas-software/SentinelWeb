// A SAÍDA COMO A TELA A LÊ — as N linhas de uma entrega viram UMA.
//
// Cada unidade é uma linha (`StockMovement`), e as N de uma mesma entrega nascem
// no mesmo INSERT: o `createdAt` igual, com o mesmo alvo, é o que as faz UMA
// saída — "Mesa 1 · 5 unidades", e não cinco linhas de um. É a entrega da
// licença, com quantidade: "Com quem está", as fichas e os históricos mostram a
// saída, e a devolução fecha N unidades dela.

/** O que uma linha precisa ter para entrar num lote. */
interface UnidadeDoLote {
  id: string;
  /** Nulo na saída devolvida de um item excluído — aí o nome está em `itemName`. */
  itemId: string | null;
  itemName?: string | null;
  createdAt: Date;
  targetType: string;
  targetPersonId: string | null;
  targetWorkstationId: string | null;
  targetWorkstationName: string | null;
}

/** A chave do lote: o mesmo INSERT, o mesmo item, o mesmo alvo. */
export function chaveDoLote(unidade: UnidadeDoLote): string {
  return [
    unidade.itemId, unidade.itemName, unidade.createdAt.getTime(), unidade.targetType,
    unidade.targetPersonId, unidade.targetWorkstationId, unidade.targetWorkstationName,
  ].join('|');
}

/**
 * Agrupa as linhas por saída, na ordem em que a primeira de cada uma aparece.
 * `primeira` é a de menor `id` — a que a tela usa para identificar a saída (o
 * `:id` da devolução vale para qualquer unidade dela).
 */
export function agruparPorLote<T extends UnidadeDoLote>(linhas: readonly T[]): { primeira: T; unidades: number }[] {
  const lotes = new Map<string, { primeira: T; unidades: number }>();
  for (const linha of linhas) {
    const chave = chaveDoLote(linha);
    const lote = lotes.get(chave);
    if (!lote) {
      lotes.set(chave, { primeira: linha, unidades: 1 });
      continue;
    }
    lote.unidades += 1;
    if (linha.id < lote.primeira.id) lote.primeira = linha;
  }
  return [...lotes.values()];
}
