import type { ReferenciaDoErro } from '../../../core/errors/app-error';
import type { ClienteEstoque } from '../helpers/stock-balance.helper';

/** Um item de estoque que está com alguém, como a frase da recusa o cita. */
export interface ItemComAlguem {
  id: string;
  nome: string;
  /** Quantas unidades dele. */
  unidades: number;
}

/**
 * Os itens de estoque abertos num ALVO — pelo nome, com quantas unidades de
 * cada: a recusa diz QUAIS voltam, como a da licença (`licencasDaPessoa`).
 *
 * SEM filtro pelo estado do item: a unidade é física e está com o alvo, esteja
 * o item ativo ou desativado. A ficha mostra a mesma unidade — contar aqui o
 * que a ficha mostra é o que faz o 409 e a tela concordarem.
 */
export async function itensAbertosNo(
  client: ClienteEstoque,
  alvo: { targetPersonId: string } | { targetWorkstationId: string },
): Promise<ItemComAlguem[]> {
  const grupos = await client.stockMovement.groupBy({
    by: ['itemId'],
    where: { ...alvo, returnedAt: null },
    _count: { _all: true },
  });
  if (grupos.length === 0) return [];

  // A unidade em uso sempre tem item (CHECK `stock_movements_item_presente`);
  // o filtro é para o tipo, que é o da coluna.
  const itens = await client.stockItem.findMany({
    where: { id: { in: grupos.flatMap((grupo) => (grupo.itemId ? [grupo.itemId] : [])) } },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
  const unidades = new Map(grupos.map((grupo) => [grupo.itemId, grupo._count._all]));
  return itens.map((item) => ({ id: item.id, nome: item.name, unidades: unidades.get(item.id) ?? 0 }));
}

/**
 * Os itens no NOME da pessoa. SÓ os de alvo PERSON: as unidades do POSTO não
 * entram pelo mesmo motivo que os ativos do posto não entram no
 * `contarPosseAberta` — elas são do posto, e quem sai da empresa não leva o
 * mouse da Mesa 1. A mesa continua com a Ana.
 */
export function itensDaPessoa(client: ClienteEstoque, personId: string): Promise<ItemComAlguem[]> {
  return itensAbertosNo(client, { targetPersonId: personId });
}

/** O total de unidades da lista. */
export function totalDeUnidades(itens: readonly ItemComAlguem[]): number {
  return itens.reduce((soma, item) => soma + item.unidades, 0);
}

/** "Mouse USB ×2 e Teclado" — o nome de cada item, e quantas quando é mais de uma. */
export function nomesDosItens(itens: readonly ItemComAlguem[]): string {
  const nomes = itens.map((item) => (item.unidades > 1 ? `${item.nome} ×${item.unidades}` : item.nome));
  return nomes.length === 1 ? nomes[0] : `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`;
}

/** Os itens como `refs` do erro: a tela põe um link para o detalhe de cada um. */
export function itensComoReferencias(itens: readonly ItemComAlguem[]): ReferenciaDoErro[] {
  return itens.map((item) => ({ tipo: 'estoque' as const, id: item.id, nome: item.nome }));
}
