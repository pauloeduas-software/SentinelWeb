import type { ClienteEstoque } from '../helpers/stock-balance.helper';

/**
 * Quantas unidades de estoque estão NO NOME da pessoa.
 *
 * SÓ as de alvo USER. As unidades do POSTO não entram pelo mesmo motivo que os
 * ativos do posto não entram no `contarPosseAberta`: elas são do posto, e quem
 * sai da empresa não leva o mouse da Mesa 1 — a mesa continua com a Ana.
 *
 * `item: { deletedAt: null }` pelo mesmo motivo do assento de licença: item na
 * lixeira não se cobra de ninguém. Hoje o item com unidade fora não vai para a
 * lixeira (409), então a condição é rede, não caso.
 */
export async function contarEstoqueDoUsuario(client: ClienteEstoque, userId: string): Promise<number> {
  return client.stockMovement.count({
    where: { targetUserId: userId, kind: 'SAIDA', returnedAt: null, item: { deletedAt: null } },
  });
}
