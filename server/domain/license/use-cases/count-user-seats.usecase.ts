import type { ClienteLicenca } from '../helpers/license-seats.helper';

/**
 * Quantos assentos de licença estão NO NOME da pessoa.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SÓ `assignedUserId`. Os assentos de ATIVO não entram, e não é descuido.
 *
 * Eles são da máquina, não dela: a Laura sai e o desktop da Mesa 1 continua
 * ligado, com o mesmo Office instalado. Contá-los aqui faria o `DELETE`
 * responder 409 sobre licença que o desligamento não tem o direito de devolver
 * — e o operador ficaria com um cadastro que nunca pode ser apagado e uma tela
 * que não oferece ação nenhuma para resolver.
 *
 * É a mesma linha que separa `diretos` de `porPosto` no `holdings`, a mesma do
 * `contarAcessoriosDiretos` da F5, e a mesma do `contarPosseAberta` para os
 * ativos.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `license: { deletedAt: null }` pelo mesmo motivo do acessório: licença na
 * lixeira não se cobra de ninguém, e contá-la travaria o cadastro para sempre —
 * o 409 exigiria a devolução de um assento que nenhuma tela mostra.
 *
 * Recebe o cliente (global ou de transação) porque os dois chamadores precisam
 * de coisas diferentes: o `DELETE` conta DENTRO da transação que vai apagar, e
 * a tela de perfil conta por fora, só para mostrar.
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
 * responde 404. O assento sai do contrato e não volta, e nada acusa — a mesma
 * metade que faltava no `contarComponentesInstalados` da F5, vista do lado do
 * ativo.
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
