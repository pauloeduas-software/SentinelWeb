import { AppError } from '../../../core/errors/app-error';
import type { prisma } from '../../../core/database/prismaClient';
import type { ClienteQueTrava } from '../../user/use-cases/lock-user.usecase';

// O SALDO — a invariante que sustenta o estoque inteiro.
//
//   disponivel = qty − COUNT(movimentos SAIDA com returnedAt IS NULL)
//
// `qty` é *quanto há no total*, a saída é *linha*, o saldo é *conta*. Num lugar
// só, porque duas cópias da mesma conta divergem no primeiro ajuste — e a
// divergência aqui é a diferença entre "tem mouse na gaveta" e "não tem".
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
// fora" e as duas inserirem, dando 6 de 5. Contar não é travar. Então toda
// saída tranca a linha do ITEM (`travarItemOuFalhar`) antes de contar — dentro
// da transação, porque um lock em autocommit é um lock que dura zero
// milissegundo.
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

/** Quantas unidades estão FORA do estoque, por item. Zero não vem no mapa. */
type ForaPorItem = Map<string, number>;

/**
 * As unidades fora do estoque de VÁRIOS itens, em UMA consulta.
 *
 * Em lote e não por linha, pelo mesmo motivo do `resolverResponsaveisEmLote`: a
 * listagem mostra até 100 itens e uma consulta por linha seria N+1 para pintar
 * uma página — com a agravante de que aqui a conta é a COLUNA PRINCIPAL.
 */
export async function contarFora(client: ClienteEstoque, ids: readonly string[]): Promise<ForaPorItem> {
  const fora: ForaPorItem = new Map();
  if (ids.length === 0) return fora;

  // COUNT, não SUM: cada linha de SAIDA É uma unidade. Entregar ao posto vale
  // UMA, qualquer que seja o número de ocupantes — o saldo do almoxarifado não
  // pode depender da escala do RH.
  const grupos = await client.stockMovement.groupBy({
    by: ['itemId'],
    where: { itemId: { in: [...ids] }, kind: 'SAIDA', returnedAt: null },
    _count: { _all: true },
  });
  for (const grupo of grupos) fora.set(grupo.itemId, grupo._count._all);
  return fora;
}

/** O de um item só. Atalho sobre a versão em lote — uma implementação, uma conta. */
export async function contarForaDe(client: ClienteEstoque, id: string): Promise<number> {
  return (await contarFora(client, [id])).get(id) ?? 0;
}

/**
 * Trava a linha do item até o fim da transação atual — o mutex do saldo.
 *
 * NÃO filtra `deletedAt`, como as travas de usuário e de ativo: travar é sobre a
 * LINHA, e um item na lixeira continua sendo uma linha que o restore disputa.
 * Quem decide o que fazer com a lixeira é a consulta seguinte.
 *
 * ORDEM DE TRAVAMENTO: usuário antes do item. A saída para pessoa trava o
 * colaborador primeiro (`lock-user.usecase.ts`), pelo mesmo motivo da entrega de
 * ativo — e nenhum caminho do sistema trava item e depois usuário. A saída a
 * posto ainda toma `FOR KEY SHARE` na linha do local pelo INSERT (aresta
 * implícita item → posto), e nenhum caminho trava posto antes de item. O grafo
 * inteiro está em `lock-asset.usecase.ts`.
 */
export async function travarItemOuFalhar(client: ClienteQueTrava, itemId: string): Promise<void> {
  const linhas = await client.$queryRaw<{ id: string }[]>`
    SELECT id FROM stock_items WHERE id = ${itemId}::uuid FOR UPDATE
  `;
  if (linhas.length === 0) throw new AppError('Item de estoque não encontrado.', 404);
}

/** O saldo, acrescentado à linha lida do banco. */
interface Saldo {
  /** Unidades fora do estoque agora. */
  fora: number;
  /** `qty − fora`. NUNCA vem do banco — ver o cabeçalho deste arquivo. */
  disponivel: number;
}

export type ComSaldo<T> = T & Saldo;

/**
 * Junta a conta à linha. Função PURA: quem foi ao banco foi o `contarFora`.
 *
 * `disponivel` pode ficar NEGATIVO, e isso é de propósito: acontece quando uma
 * linha de saída é criada à mão no psql, por fora da trava. Zerar o número aqui
 * esconderia exatamente a inconsistência que a tela precisa mostrar.
 */
export function comSaldo<T extends { qty: number }>(item: T, fora: number): ComSaldo<T> {
  return { ...item, fora, disponivel: item.qty - fora };
}

/**
 * A recusa da saída sem unidade — com os NÚMEROS na frase, para a tela não ter
 * que recontar.
 */
export function assertDisponivel(item: { name: string; qty: number }, pedidas: number, fora: number): void {
  const disponivel = item.qty - fora;
  if (pedidas <= disponivel) return;

  // Duas frases, porque são dois estados: nada disponível, ou menos do que a
  // saída pede. "Sem unidade disponível" com duas na gaveta seria falsa.
  const frase = disponivel <= 0
    ? `Sem unidade disponível de ${item.name}: ${fora} de ${item.qty} fora do estoque.`
    : `Sem unidade suficiente de ${item.name}: a saída pede ${pedidas} e há ${disponivel} `
      + `${disponivel === 1 ? 'disponível' : 'disponíveis'} (${fora} de ${item.qty} fora do estoque).`;

  throw new AppError(frase, 409);
}
