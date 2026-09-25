import type { ClienteLicenca } from '../helpers/license-seats.helper';

// OS ASSENTOS DE LICENÇA DE UMA PESSOA — a lista que a tela de perfil mostra e
// que o desligamento vai fechar.
//
// ═════════════════════════════════════════════════════════════════════════════
// O `where` DAQUI É O MESMO DE `devolverAssentosDoUsuario`, E TEM QUE CONTINUAR
// SENDO.
//
// Esta lista não é decorativa: ela é a PROMESSA que o modal do desligamento faz
// antes de confirmar ("vamos devolver estes três assentos, e este aqui queima").
// Se ela mostrasse um conjunto diferente do que o `offboard` fecha, o modal
// prometeria uma coisa e a operação faria outra — e o caso que dói é o da
// queima, porque não tem desfazer.
//
// São três condições, as mesmas em três arquivos:
//
//   `assignedUserId`                  só o que é DELA. O assento do desktop da
//                                     Mesa 1 é da máquina (D39) e não entra —
//                                     nem aqui, nem no 409, nem no desligamento;
//   `checkinAt: null`                 só ocupação aberta;
//   `license.deletedAt: null`         licença na lixeira não se cobra de
//                                     ninguém (ver `count-user-seats`).
//
// Os outros dois são `count-user-seats.usecase.ts` (o 409 do `DELETE`) e
// `checkin-user-seats.usecase.ts` (o desligamento). Mexer em um sem os outros é
// o que faz a tela e a operação discordarem.
// ═════════════════════════════════════════════════════════════════════════════
//
// NÃO EXISTE `via` AQUI, ao contrário do acessório (D33), e a ausência é o
// ponto: acessório chega por dois caminhos — dela e do posto —, e por isso cada
// linha precisa dizer qual. Assento só chega por um. O que é do ativo aparece
// na aba Licenças DAQUELE ativo, que é onde alguém pode fazer algo a respeito.

export interface AssentoEmPosse {
  /** O id da OCUPAÇÃO, não o do assento: é dele que sai a devolução. */
  checkoutId: string;
  seatId: string;
  seatNumber: number;
  licenseId: string;
  licenseName: string;
  categoryName: string | null;
  /**
   * `false` = devolver este assento QUEIMA ele (D43): ele não volta ao
   * contrato, nem agora nem nunca.
   *
   * Vem por ASSENTO e não como um total porque é isso que o aviso do
   * desligamento precisa dizer — quais assentos serão destruídos, não quantos.
   */
  reassignable: boolean;
  checkoutAt: Date;
}

export async function listUserSeats(
  client: ClienteLicenca,
  userId: string,
): Promise<AssentoEmPosse[]> {
  const abertas = await client.licenseSeatCheckout.findMany({
    where: {
      assignedUserId: userId,
      checkinAt: null,
      seat: { license: { deletedAt: null } },
    },
    select: {
      id: true,
      checkoutAt: true,
      seat: {
        select: {
          id: true,
          seatNumber: true,
          licenseId: true,
          license: {
            select: {
              name: true,
              reassignable: true,
              category: { select: { name: true } },
            },
          },
        },
      },
    },
    // Pela licença e depois pelo número do assento: quem confere a lista lê
    // "Office 2024 · assento 3" e procura o contrato, não a data da entrega.
    orderBy: [{ seat: { license: { name: 'asc' } } }, { seat: { seatNumber: 'asc' } }],
  });

  return abertas.map((ocupacao) => ({
    checkoutId: ocupacao.id,
    seatId: ocupacao.seat.id,
    seatNumber: ocupacao.seat.seatNumber,
    licenseId: ocupacao.seat.licenseId,
    licenseName: ocupacao.seat.license.name,
    categoryName: ocupacao.seat.license.category?.name ?? null,
    reassignable: ocupacao.seat.license.reassignable,
    checkoutAt: ocupacao.checkoutAt,
  }));
}
