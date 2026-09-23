import type { ClienteEstoque } from '../helpers/stock-kind.helper';

/**
 * Quantas unidades de acessório estão NO NOME da pessoa.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SÓ `targetType: 'USER'`. As unidades do POSTO não entram, e não é descuido.
 *
 * Elas são do posto, não dela: a Laura sai e a Ana continua trabalhando na Mesa
 * 1 com os mesmos 5 mouses em cima. Contá-las aqui faria o `DELETE` responder
 * 409 sobre equipamento que o desligamento não tem o direito de devolver — e o
 * operador ficaria com um cadastro que nunca pode ser apagado e uma tela que
 * não oferece ação nenhuma para resolver.
 *
 * É a mesma linha que separa `diretos` de `porPosto` no `holdings`, e a mesma
 * do `contarPosseAberta` para os ativos.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Recebe o cliente (global ou de transação) porque os dois chamadores precisam
 * de coisas diferentes: o `DELETE` conta DENTRO da transação que vai apagar, e
 * a tela de perfil conta por fora, só para mostrar.
 */
export async function contarAcessoriosDiretos(
  client: ClienteEstoque,
  userId: string,
): Promise<number> {
  return client.accessoryCheckout.count({
    where: {
      targetType: 'USER',
      targetUserId: userId,
      checkedInAt: null,
      // Mesmo motivo do `holdings`: acessório na lixeira não se cobra de
      // ninguém, e contá-lo travaria o cadastro para sempre — o 409 exigiria a
      // devolução de uma unidade que nenhuma tela mostra.
      accessory: { deletedAt: null },
    },
  });
}
