import { AppError } from '../../../core/errors/app-error';
import type { ClienteEstoque, StockKind } from './stock-kind.helper';

// O SALDO — a invariante que sustenta a fase inteira (D34).
//
//   disponivel(accessory)  = qty − COUNT(checkouts WHERE checkedInAt IS NULL)
//   disponivel(consumable) = qty − SUM(consumos.qty)
//   disponivel(component)  = qty − SUM(assignedQty WHERE detachedAt IS NULL)
//
// `qty` é *quanto entrou*, a saída é *linha*, o saldo é *conta*. Num lugar só,
// porque três cópias da mesma conta divergem no primeiro ajuste — e a divergência
// aqui é a diferença entre "tem mouse na gaveta" e "não tem".
//
// ─────────────────────────────────────────────────────────────────────────────
// POR QUE NÃO UMA COLUNA `qtyAvailable`
//
// A corrida óbvia é a do ler-e-depois-escrever, a mesma que o `nextAssetTag()`
// da F1 documenta: duas requisições leem `qtyAvailable = 1`, as duas calculam
// `0`, as duas gravam — duas unidades entregues de um estoque de uma. Em READ
// COMMITTED nada impede, e um `UPDATE … SET x = x − 1` resolve só ESSE caso.
//
// A segunda é pior porque é silenciosa e permanente: A COLUNA PODE DIVERGIR DAS
// LINHAS. Basta um INSERT de checkout que não passe pelo decremento — falha no
// meio de uma operação sem transação, correção à mão no psql, importador de CSV
// da F10. A partir daí a coluna mente PARA SEMPRE e nada detecta, porque a
// coluna *é* a resposta: não existe ninguém para discordar dela.
//
// Com `COUNT` a resposta não pode divergir das linhas — ela SÃO as linhas. É o
// D16 uma camada abaixo.
// ─────────────────────────────────────────────────────────────────────────────

/** Quantas unidades estão FORA do estoque, por item. Zero não vem no mapa. */
export type EmUsoPorItem = Map<string, number>;

/**
 * As unidades fora do estoque de VÁRIOS itens, em UMA consulta.
 *
 * Em lote e não por linha, pelo mesmo motivo do `resolverResponsaveisEmLote`: a
 * listagem mostra até 100 itens e uma consulta por linha seria N+1 para pintar
 * uma página — com a agravante de que aqui a conta é a COLUNA PRINCIPAL, então
 * ninguém poderia deixá-la para depois.
 *
 * `groupBy` e não `findMany` + soma em memória: trazer 4 mil linhas de consumo
 * para contar três números é tráfego que o Postgres faz melhor sozinho.
 */
export async function contarEmUso(
  client: ClienteEstoque,
  kind: StockKind,
  ids: readonly string[],
): Promise<EmUsoPorItem> {
  const emUso: EmUsoPorItem = new Map();
  if (ids.length === 0) return emUso;

  const lista = [...ids];

  if (kind === 'ACCESSORY') {
    // COUNT, não SUM: cada linha de `accessory_checkouts` É uma unidade. Uma
    // entrega ao posto vale UMA, qualquer que seja o número de ocupantes (D33)
    // — o saldo do almoxarifado não pode depender da escala do RH.
    const grupos = await client.accessoryCheckout.groupBy({
      by: ['accessoryId'],
      where: { accessoryId: { in: lista }, checkedInAt: null },
      _count: { _all: true },
    });
    for (const grupo of grupos) emUso.set(grupo.accessoryId, grupo._count._all);
    return emUso;
  }

  if (kind === 'CONSUMABLE') {
    // SEM filtro de fechamento, e não por esquecimento: a coluna não existe
    // (D37). Todo consumo já registrado conta para sempre.
    const grupos = await client.consumableCheckout.groupBy({
      by: ['consumableId'],
      where: { consumableId: { in: lista } },
      _sum: { qty: true },
    });
    for (const grupo of grupos) emUso.set(grupo.consumableId, grupo._sum.qty ?? 0);
    return emUso;
  }

  // SUM das linhas ABERTAS. A devolução parcial fecha a linha de 4 e abre uma de
  // 2 (D38), então a soma das abertas é sempre o estado atual — e a sequência
  // fechada continua sendo o histórico.
  const grupos = await client.componentAsset.groupBy({
    by: ['componentId'],
    where: { componentId: { in: lista }, detachedAt: null },
    _sum: { assignedQty: true },
  });
  for (const grupo of grupos) emUso.set(grupo.componentId, grupo._sum.assignedQty ?? 0);
  return emUso;
}

/** O de um item só. Atalho sobre a versão em lote — uma implementação, uma conta. */
export async function contarEmUsoDe(
  client: ClienteEstoque,
  kind: StockKind,
  id: string,
): Promise<number> {
  const mapa = await contarEmUso(client, kind, [id]);
  return mapa.get(id) ?? 0;
}

/** O saldo e o sinal de estoque baixo, acrescentados à linha lida do banco. */
export interface Saldo {
  /** Unidades fora do estoque agora. */
  emUso: number;
  /** `qty − emUso`. NUNCA vem do banco — ver o cabeçalho deste arquivo. */
  disponivel: number;
  /** `disponivel < minQty`. `false` quando `minQty` é nulo: sem piso, sem alerta. */
  estoqueBaixo: boolean;
}

export type ComSaldo<T> = T & Saldo;

/**
 * Junta a conta à linha. Função PURA: quem foi ao banco foi o `contarEmUso`.
 *
 * `disponivel` pode ficar NEGATIVO, e isso é de propósito. Acontece quando
 * alguém baixa `qty` por `adjust-quantity` abaixo do que já saiu — o que o
 * use-case recusa — ou quando uma linha de saída é criada à mão no psql. Zerar
 * o número aqui esconderia exatamente a inconsistência que o alerta existe para
 * mostrar; o negativo é o sinal de que a contagem física e a nominal brigaram.
 */
export function comSaldo<T extends { qty: number; minQty: number | null }>(
  item: T,
  emUso: number,
): ComSaldo<T> {
  const disponivel = item.qty - emUso;
  return {
    ...item,
    emUso,
    disponivel,
    estoqueBaixo: item.minQty !== null && disponivel < item.minQty,
  };
}

/**
 * O mínimo que um cliente precisa ter para travar: só o SQL cru.
 *
 * Estrutural, e não `PrismaClient`, porque quem chama é sempre o `tx` de dentro
 * de uma `$transaction` — e fora dela o `FOR UPDATE` seria liberado no mesmo
 * instante e não protegeria nada. Mesmo contrato do `ClienteQueTrava` do
 * `user/use-cases/lock-user.usecase.ts`.
 */
export interface ClienteQueTrava {
  $queryRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
}

/**
 * Trava a LINHA-PAI do item até o fim da transação atual.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CONTAR NÃO É TRAVAR — e é isto que o `COUNT` sozinho não resolve.
 *
 * Duas requisições podem contar "4 de 5 ocupados" e as duas inserirem: 6 de 5.
 * O `COUNT` garante que a resposta não diverge das linhas; ele não impede que
 * duas linhas nasçam ao mesmo tempo. Em READ COMMITTED nenhuma enxerga o
 * checkout que a outra ainda não confirmou, e nenhum `if` pega isso.
 *
 * A saída é serializar na linha que as duas disputam: a do acessório. Enquanto
 * a primeira transação não confirma, a segunda fica parada aqui; quando ela
 * destrava, o `COUNT` seguinte já enxerga a unidade que saiu.
 *
 * Serializa só as saídas DO MESMO ITEM. Entregar um mouse e um teclado ao mesmo
 * tempo não disputa linha nenhuma.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * POR QUE SQL CRU, E NÃO UM `update` DA API TIPADA. O equivalente tipado é um
 * `tx.accessory.update({ where: { id }, data: { updatedAt: new Date() } })`
 * como primeira operação: ele tranca a mesma linha. Mas esconde a intenção
 * atrás de uma escrita que não muda nada — quem lesse depois removeria o
 * "update inútil" e derrubaria a trava sem perceber. E ainda sujaria o
 * `updatedAt` de todo item a cada entrega.
 *
 * NÃO filtra `deletedAt`: travar é sobre a LINHA, e um item na lixeira continua
 * sendo uma linha que o restore vai disputar. Quem decide o que fazer com a
 * lixeira é a consulta seguinte, que passa pelo escopo da extension.
 *
 * TRÊS TEMPLATES LITERAIS, e não um nome de tabela interpolado: `$queryRawUnsafe`
 * com identificador montado é a porta que este projeto não abre, nem com um
 * valor que hoje vem de constante nossa.
 */
export async function travarItem(
  client: ClienteQueTrava,
  kind: StockKind,
  id: string,
): Promise<boolean> {
  // `${id}` vira PARÂMETRO do Postgres, não texto concatenado. O `::uuid` é
  // necessário porque o parâmetro chega como texto e a coluna é `uuid`.
  const linhas = kind === 'ACCESSORY'
    ? await client.$queryRaw<{ id: string }[]>`SELECT id FROM accessories WHERE id = ${id}::uuid FOR UPDATE`
    : kind === 'CONSUMABLE'
      ? await client.$queryRaw<{ id: string }[]>`SELECT id FROM consumables WHERE id = ${id}::uuid FOR UPDATE`
      : await client.$queryRaw<{ id: string }[]>`SELECT id FROM components WHERE id = ${id}::uuid FOR UPDATE`;

  return linhas.length > 0;
}

/** A mesma trava, com o 404 que todo chamador daria. */
export async function travarItemOuFalhar(
  client: ClienteQueTrava,
  kind: StockKind,
  rotulo: string,
  id: string,
): Promise<void> {
  if (!(await travarItem(client, kind, id))) {
    throw new AppError(`Nenhum ${rotulo} com este identificador.`, 404);
  }
}

/**
 * Recusa a saída quando não há unidade. A MESMA frase nos três tipos.
 *
 * Os `details` levam os três números porque a tela precisa mostrar o porquê sem
 * reparsear a frase em português — e porque "sem unidade disponível" ao lado de
 * `qty: 5` é a informação que faz o operador ir procurar as devoluções abertas.
 */
export function assertDisponivel(
  rotulo: string,
  pedido: number,
  qty: number,
  emUso: number,
): void {
  const disponivel = qty - emUso;
  if (pedido <= disponivel) return;

  throw new AppError(
    `Sem unidade suficiente deste ${rotulo}: ${disponivel} disponível(is) de ${qty}.`,
    409,
    { pedido, qty, emUso, disponivel },
  );
}

/**
 * As saídas que ainda estão ABERTAS — o que recusa o `DELETE` com 409.
 *
 * Difere do `contarEmUso` num ponto, e só nele: o CONSUMÍVEL devolve **zero**.
 * Não é atalho — é que consumo não tem estado aberto (D37). Um consumível com
 * cem linhas de consumo pode ir para a lixeira, e é o que se quer: a lixeira
 * aqui existe justamente para o histórico sobreviver (D36). Contar os consumos
 * travaria para sempre o item mais usado do almoxarifado.
 */
export async function contarSaidasAbertas(
  client: ClienteEstoque,
  kind: StockKind,
  id: string,
): Promise<number> {
  if (kind === 'CONSUMABLE') return 0;
  return contarEmUsoDe(client, kind, id);
}
