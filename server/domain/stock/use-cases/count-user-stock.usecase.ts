import type { ClienteEstoque } from '../helpers/stock-balance.helper';

/**
 * Quantas unidades de estoque estão NO NOME da pessoa.
 *
 * SÓ as de alvo USER. As unidades do POSTO não entram pelo mesmo motivo que os
 * ativos do posto não entram no `contarPosseAberta`: elas são do posto, e quem
 * sai da empresa não leva o mouse da Mesa 1 — a mesa continua com a Ana.
 *
 * SEM filtro pela lixeira do item, e isso é escolha: a unidade é física e está
 * com a pessoa, esteja o cadastro do item onde estiver. A ficha da pessoa
 * (`listUserStock`) mostra a mesma unidade — contar aqui o que a ficha mostra é
 * o que faz o 409 e a tela concordarem. (Pela aplicação o item com unidade fora
 * nem vai para a lixeira: `deleteStockItem` recusa.)
 */
export async function contarEstoqueDoUsuario(client: ClienteEstoque, userId: string): Promise<number> {
  return client.stockMovement.count({
    where: { targetUserId: userId, kind: 'SAIDA', returnedAt: null },
  });
}
