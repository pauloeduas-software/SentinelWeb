import { AppError } from '../../../core/errors/app-error';
import type { prisma } from '../../../core/database/prismaClient';
import type { ClienteQueTrava } from '../../person/use-cases/lock-person.usecase';

// A CONTA DO ITEM — a mesma da licença (`license-count.helper.ts`), com outras
// palavras:
//
//   disponivel = qty − COUNT(unidades com returnedAt IS NULL)
//
// `qty` é *quanto há no total*, cada unidade que saiu é *linha*, o disponível é
// *conta*. Num lugar só, porque duas cópias da mesma conta divergem no primeiro
// ajuste — e a divergência aqui é a diferença entre "tem mouse na gaveta" e
// "não tem".
//
// ─────────────────────────────────────────────────────────────────────────────
// POR QUE NÃO UMA COLUNA `disponivel`
//
// A corrida óbvia é a do ler-e-depois-escrever: duas requisições leem
// `disponivel = 1`, as duas calculam `0`, as duas gravam — duas unidades
// entregues de um estoque de uma. Em READ COMMITTED nada impede, e um
// `UPDATE … SET x = x − 1` resolve só ESSE caso.
//
// A segunda é pior porque é silenciosa e permanente: A COLUNA PODE DIVERGIR DAS
// LINHAS. Basta um INSERT de saída que não passe pelo decremento — falha no
// meio de uma operação sem transação, correção à mão no psql. A partir daí a
// coluna mente PARA SEMPRE e nada detecta, porque a coluna *é* a resposta: não
// existe ninguém para discordar dela. Com `COUNT` a resposta não pode divergir
// das linhas — ela SÃO as linhas.
//
// O QUE O `COUNT` SOZINHO NÃO RESOLVE: duas requisições podem contar "4 de 5
// em uso" e as duas inserirem, dando 6 de 5. Contar não é travar. Então toda
// entrega — e toda edição que reduz o total — tranca a linha do ITEM
// (`travarItemOuFalhar`) antes de contar, dentro da transação, porque um lock
// em autocommit é um lock que dura zero milissegundo.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * O cliente das contagens: o global ou o de transação.
 *
 * `Omit<…, '$'>` tira os métodos de sessão, que o cliente de transação não tem
 * — a mesma forma do `ClientePosse`, para o `contarPosseAberta` do colaborador
 * (que recebe um `ClientePosse`) poder contar estoque com o mesmo cliente.
 * Quem precisa travar pede `ClienteQueTrava` à parte.
 */
export type ClienteEstoque = Omit<typeof prisma, `$${string}`>;

/** O que a conta de um item precisa das linhas de saída. */
export interface UsoDoItem {
  /** Unidades com alguém agora. */
  emUso: number;
  /** Já saiu alguma vez, devolvida ou não: o item tem passado. Não impede excluir — só a em uso impede (AG). */
  jaEntregue: boolean;
}

export const SEM_USO: UsoDoItem = { emUso: 0, jaEntregue: false };

/**
 * O uso de VÁRIOS itens, em DUAS consultas.
 *
 * Em lote e não por linha, pelo mesmo motivo do `contarUso` da licença: a
 * listagem mostra até 100 itens e uma consulta por linha seria N+1 para pintar
 * a coluna principal da tela.
 */
export async function contarUso(client: ClienteEstoque, ids: readonly string[]): Promise<Map<string, UsoDoItem>> {
  const uso = new Map<string, UsoDoItem>();
  if (ids.length === 0) return uso;

  // COUNT: cada linha É uma unidade. Entregar ao posto vale UMA, qualquer que
  // seja o número de ocupantes — o saldo do almoxarifado não pode depender da
  // escala do RH.
  const [abertas, entregues] = await Promise.all([
    client.stockMovement.groupBy({
      by: ['itemId'],
      where: { itemId: { in: [...ids] }, returnedAt: null },
      _count: { _all: true },
    }),
    // Abertas e devolvidas: o item tem passado (`jaEntregue`).
    client.stockMovement.groupBy({
      by: ['itemId'],
      where: { itemId: { in: [...ids] } },
    }),
  ]);

  const emUso = new Map(abertas.map((grupo) => [grupo.itemId, grupo._count._all]));
  // `itemId` nunca é nulo aqui — o filtro é por ele —, mas o tipo da coluna é.
  for (const { itemId } of entregues) {
    if (itemId) uso.set(itemId, { emUso: emUso.get(itemId) ?? 0, jaEntregue: true });
  }
  return uso;
}

/** O de um item só. Atalho sobre a versão em lote — uma implementação, uma conta. */
export async function contarUsoDe(client: ClienteEstoque, id: string): Promise<UsoDoItem> {
  return (await contarUso(client, [id])).get(id) ?? SEM_USO;
}

/**
 * Trava a linha do item até o fim da transação atual — o mutex do saldo.
 *
 * ORDEM DE TRAVAMENTO: colaborador antes do item. A saída para pessoa trava o
 * colaborador primeiro (`lock-person.usecase.ts`), pelo mesmo motivo da entrega
 * de ativo e de licença — e nenhum caminho do sistema trava item e depois
 * colaborador. A saída a posto ainda toma `FOR KEY SHARE` na linha do posto
 * pelo INSERT (aresta implícita item → posto), e nenhum caminho trava posto
 * antes de item. O grafo inteiro está em `lock-asset.usecase.ts`.
 */
export async function travarItemOuFalhar(client: ClienteQueTrava, itemId: string): Promise<void> {
  const linhas = await client.$queryRaw<{ id: string }[]>`
    SELECT id FROM stock_items WHERE id = ${itemId}::uuid FOR UPDATE
  `;
  if (linhas.length === 0) throw new AppError('Item de estoque não encontrado.', 404);
}

/** A conta, acrescentada à linha lida do banco. */
interface ContagemDoItem extends UsoDoItem {
  /** `qty − emUso`. NUNCA vem do banco — ver o cabeçalho deste arquivo. */
  disponivel: number;
}

export type ComContagem<T> = T & ContagemDoItem;

/**
 * Junta a conta à linha. Função PURA: quem foi ao banco foi o `contarUso`.
 *
 * `disponivel` pode ficar NEGATIVO, e isso é de propósito: acontece quando uma
 * linha de saída é criada à mão no psql, por fora da trava. Zerar o número aqui
 * esconderia exatamente a inconsistência que a tela precisa mostrar.
 */
export function comContagem<T extends { qty: number }>(item: T, uso: UsoDoItem): ComContagem<T> {
  return { ...item, ...uso, disponivel: item.qty - uso.emUso };
}

function quantas(total: number, singular: string, plural: string): string {
  return `${total} ${total === 1 ? singular : plural}`;
}

/**
 * A recusa da entrega sem unidade — com os NÚMEROS na frase, para a tela não ter
 * que recontar, e o que fazer, como a `fraseSemVaga` da licença.
 */
export function assertDisponivel(item: { name: string; qty: number }, pedidas: number, emUso: number): void {
  const disponivel = item.qty - emUso;
  if (pedidas <= disponivel) return;

  // Duas frases, porque são dois estados: nada disponível, ou menos do que a
  // entrega pede. "Sem unidade disponível" com duas na gaveta seria falsa.
  const conta = `${item.qty} no total, ${emUso} em uso`;
  const frase = disponivel <= 0
    ? `Sem unidade disponível de "${item.name}": ${conta}. Devolva uma unidade ou aumente o total.`
    : `Sem unidade suficiente de "${item.name}": a entrega pede ${pedidas} e há `
      + `${quantas(disponivel, 'disponível', 'disponíveis')} (${conta}).`;

  throw new AppError(frase, 409);
}

/** Por que o total não desce até `novoTotal`: o piso é o que está em uso. A frase da licença. */
export function fraseDoPiso(nome: string, novoTotal: number, emUso: number): string {
  return `Não dá para reduzir "${nome}" para ${novoTotal}: ${quantas(emUso, 'está', 'estão')} em uso. `
    + 'Devolva para liberar.';
}
