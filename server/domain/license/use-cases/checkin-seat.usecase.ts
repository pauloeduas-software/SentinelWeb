import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { recordActivity } from '../../activity/use-cases/record-activity.usecase';
import { contarAssentosDe, travarAssento, type ClienteLicenca, type ClienteQueTrava } from '../helpers/license-seats.helper';
import { SEAT_CHECKOUT_SELECT } from '../helpers/license-select.helper';
import type { CheckinSeatData } from '../schemas/license.schema';

// A DEVOLUÇÃO DE UM ASSENTO — e a queima, quando a licença não é reatribuível.
//
// ═════════════════════════════════════════════════════════════════════════════
// POR QUE ESTE CHECKIN TRAVA O ASSENTO, SE O DO ACESSÓRIO NÃO TRAVA NADA.
//
// Duas razões, e a segunda é a que não é óbvia.
//
// 1. ELE PRECISA DA LINHA. A queima escreve `burnedAt` em `license_seats` —
//    não há como fazer isso sem tocar a linha do assento.
//
// 2. ELE FECHA A SEGUNDA CORRIDA, a que o D41 não cita. Sem travar o assento, o
//    checkin não disputa linha nenhuma com o checkout: em READ COMMITTED, o
//    `FOR UPDATE OF s` do `pegarAssentoLivre` só reavalia o `WHERE` para linhas
//    que uma transação concorrente tenha ATUALIZADO NA TABELA TRAVADA — e um
//    checkin que só mexesse em `license_seat_checkouts` não atualiza
//    `license_seats`. O resultado seria um assento liberado um instante antes
//    ficar invisível para a entrega que chega em seguida: 409 com assento livre
//    no banco.
//
// Não há deadlock: checkout e checkin tomam o assento como primeira trava
// depois do alvo, sempre na mesma ordem (D90).
// ═════════════════════════════════════════════════════════════════════════════

export interface ResultadoDaDevolucao {
  checkout: Awaited<ReturnType<typeof lerCheckout>>;
  /** O assento foi QUEIMADO nesta devolução? A tela avisa antes; isto confirma. */
  queimado: boolean;
  /** Quantos assentos continuam utilizáveis. É o número que o aviso prometeu. */
  livres: number;
}

function lerCheckout(tx: ClienteLicenca, checkoutId: string) {
  return tx.licenseSeatCheckout.findUniqueOrThrow({
    where: { id: checkoutId },
    select: SEAT_CHECKOUT_SELECT,
  });
}

export async function checkinSeat(
  seatId: string,
  data: CheckinSeatData,
  actorId: string | null,
): Promise<ResultadoDaDevolucao> {
  return prisma.$transaction(async (tx) => {
    if (!(await travarAssento(tx, seatId))) {
      throw new AppError('Nenhum assento com este identificador.', 404);
    }

    const assento = await tx.licenseSeat.findUniqueOrThrow({
      where: { id: seatId },
      select: {
        id: true, seatNumber: true, burnedAt: true, licenseId: true,
        license: { select: { id: true, name: true, reassignable: true } },
      },
    });

    const aberta = await tx.licenseSeatCheckout.findFirst({
      where: { seatId, checkinAt: null },
      select: { id: true, assignedUserId: true, assignedAssetId: true },
    });

    // 409 e não 404: o assento existe, o ESTADO dele é que recusa — mesma
    // família do "esta unidade já foi devolvida" e do "este ativo já está
    // entregue".
    if (!aberta) {
      throw new AppError(
        `O assento ${assento.seatNumber} de "${assento.license.name}" não está ocupado.`,
        409,
        { seatNumber: assento.seatNumber },
      );
    }

    const devolvidoEm = new Date();

    await tx.licenseSeatCheckout.update({
      where: { id: aberta.id },
      data: { checkinAt: devolvidoEm, checkinNotes: data.notes ?? null, checkinById: actorId },
    });

    // ── A QUEIMA (D43) ───────────────────────────────────────────────────────
    //
    // `reassignable = false` significa que o fornecedor não aceita o assento
    // voltar ao contrato: devolver DESTRÓI VALOR. É perda de dinheiro
    // ("compramos 50, temos 43 utilizáveis"), e por isso `burnedAt` é coluna
    // própria e não um enum com motivo ao lado de `retiredAt` — os dois
    // alimentam relatórios diferentes, e empacotados num enum a primeira
    // consulta que quisesse só um deles voltaria a separar por string.
    //
    // `!assento.burnedAt` porque um assento já queimado não queima duas vezes:
    // ele nunca deveria estar ocupado, e se estiver (correção à mão no psql),
    // reescrever a data apagaria quando a perda aconteceu de verdade.
    const queimado = !assento.license.reassignable && !assento.burnedAt;
    if (queimado) {
      await tx.licenseSeat.update({
        where: { id: seatId },
        data: { burnedAt: devolvidoEm },
      });
    }

    await recordActivity(tx, {
      entityType: 'License',
      entityId: assento.licenseId,
      action: 'CHECKIN',
      changes: {
        checkoutId: aberta.id,
        seatId,
        seatNumber: assento.seatNumber,
        alvo: aberta.assignedUserId ? 'USER' : 'ASSET',
        alvoId: aberta.assignedUserId ?? aberta.assignedAssetId,
        queimado,
        checkinAt: devolvidoEm.toISOString(),
      },
    }, actorId);

    // A QUEIMA TEM LOG PRÓPRIO, além do CHECKIN. São dois fatos: um assento
    // voltou (operação de rotina) e um assento deixou de existir para sempre
    // (perda patrimonial). Quem audita o custo da licença procura o segundo, e
    // ele não pode estar escondido dentro do `changes` de uma devolução comum.
    if (queimado) {
      await recordActivity(tx, {
        entityType: 'License',
        entityId: assento.licenseId,
        action: 'RETIRE',
        changes: {
          motivo: 'QUEIMA',
          seatId,
          seatNumber: assento.seatNumber,
          burnedAt: devolvidoEm.toISOString(),
        },
      }, actorId);
    }

    // A contagem DEPOIS de tudo, dentro da transação: é o número que a tela
    // prometeu no aviso de queima ("restarão 4 de 5 utilizáveis"), e ele tem
    // que ser o de verdade, não o que o cliente calculou antes de clicar.
    const { livres } = await contarAssentosDe(tx as ClienteLicenca & ClienteQueTrava, assento.licenseId);

    return { checkout: await lerCheckout(tx, aberta.id), queimado, livres };
  });
}
