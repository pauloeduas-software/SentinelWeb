import type { ClienteLicenca } from '../helpers/license-seats.helper';

/**
 * Quantos assentos de licença estão NO NOME da pessoa.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SÓ `assignedUserId`. Os assentos de ATIVO não entram, e não é descuido.
 *
 * Eles são da máquina, não dela: a Laura sai e o desktop da Mesa 1 continua
 * ligado, com o mesmo Office instalado. Contá-los aqui faria a exclusão (e a
 * desativação) responder 409 sobre licença que ela não tem o direito de devolver
 * — e o operador ficaria com um cadastro que nunca pode ser apagado e uma tela
 * que não oferece ação nenhuma para resolver.
 *
 * É a mesma linha do `contarEstoqueDoUsuario` para as unidades de estoque, e a
 * mesma do `contarPosseAberta` para os ativos.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `license: { deletedAt: null }` explícito: licença na
 * lixeira não se cobra de ninguém, e contá-la travaria o cadastro para sempre —
 * o 409 exigiria a devolução de um assento que nenhuma tela mostra.
 *
 * Recebe o cliente de transação porque quem conta é a exclusão e a desativação
 * (pelo `contarPosseAberta`), DENTRO da transação que grava.
 */
export async function contarAssentosDoUsuario(
  client: ClienteLicenca,
  userId: string,
): Promise<number> {
  return client.licenseSeatCheckout.count({
    where: {
      assignedUserId: userId,
      checkinAt: null,
      seat: { license: { deletedAt: null } },
    },
  });
}

/**
 * Quantos assentos este ATIVO ocupa agora.
 *
 * É o que recusa o `DELETE` de um ativo que ainda segura licença. Sem ela,
 * mandar o notebook para a lixeira deixa o assento preso: ele continua contando
 * como ocupado (a contagem olha `license_seat_checkouts`, que não tem
 * `deletedAt` e não sabe que o ativo sumiu) e a tela que ofereceria a devolução
 * responde 404. O assento sai do contrato e não volta, e nada acusa.
 */
export async function contarAssentosDoAtivo(
  client: ClienteLicenca,
  assetId: string,
): Promise<number> {
  return client.licenseSeatCheckout.count({
    where: {
      assignedAssetId: assetId,
      checkinAt: null,
      seat: { license: { deletedAt: null } },
    },
  });
}
