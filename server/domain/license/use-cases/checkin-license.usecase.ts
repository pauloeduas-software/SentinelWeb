import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { recordAudit } from '../../audit/use-cases/record-audit.usecase';
import type { Ator } from '../../audit/audit.types';
import { diaEmPortugues } from '../../asset/helpers/asset-dates.helper';
import { hojeNoBrasil, instanteDoDia } from '../../shared/hoje.helper';
import { CHECKOUT_SELECT, rotuloDoAlvoDaEntrega } from '../helpers/license-select.helper';
import type { CheckinLicenseData } from '../schemas/license.schema';

// A DEVOLUÇÃO DE UMA LICENÇA — e ela volta a ficar livre.
//
// PELA ENTREGA, nunca pela licença ou pelo alvo: o `:id` é o da linha de
// entrega. É o que impede a tela velha de devolver a pessoa errada — uma linha
// devolvida responde 409 em vez de fechar a entrega que outra pessoa abriu
// depois.
//
// TRAVA SÓ A LINHA DA ENTREGA. É ela que impede a devolução dupla (a segunda
// espera, relê e encontra `checkinAt` preenchido). A licença não é travada: a
// devolução só diminui o que está em uso, e uma entrega concorrente que conte
// antes dela só erra para o lado seguro (um 409 de "sem licença livre" que um
// segundo depois não seria). Travar a licença aqui, depois da linha, fecharia
// um ciclo com a troca de chave — ver `lock-license.usecase.ts`.

export async function checkinLicense(checkoutId: string, data: Partial<CheckinLicenseData>, ator: Ator) {
  await prisma.$transaction(async (tx) => {
    const travada = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM license_checkouts WHERE id = ${checkoutId}::uuid FOR UPDATE
    `;
    if (travada.length === 0) throw new AppError('Nenhuma entrega de licença com este identificador.', 404);

    const entrega = await tx.licenseCheckout.findUniqueOrThrow({
      where: { id: checkoutId },
      select: CHECKOUT_SELECT,
    });

    // 409 e não 404: a entrega existe, o ESTADO dela é que recusa. A da
    // licença excluída (AG) é sempre devolvida — a em uso segura a exclusão.
    const licenca = entrega.license;
    if (entrega.checkinAt || !licenca || !entrega.licenseId) {
      throw new AppError(
        `Esta entrega de "${licenca?.name ?? entrega.licenseName}" para ${rotuloDoAlvoDaEntrega(entrega)} já foi devolvida.`,
        409,
      );
    }

    // O DIA da devolução não antecede o DIA da entrega — os dois no calendário
    // de Brasília, que é o que a tela mostra.
    const dia = data.checkinAt ?? hojeNoBrasil();
    const diaDaEntrega = hojeNoBrasil(entrega.checkoutAt);
    if (dia < diaDaEntrega) {
      throw new AppError(
        `A devolução (${diaEmPortugues(dia)}) não pode ser antes da entrega (${diaEmPortugues(diaDaEntrega)}).`,
        422,
      );
    }

    // No MESMO dia, o instante do dia passado (meio-dia) pode cair antes da hora
    // real da entrega — a feita às 23h. A devolução nunca fica antes dela: é o
    // CHECK `license_checkouts_devolucao_nao_antecede`.
    const instante = instanteDoDia(dia);
    const checkinAt = instante < entrega.checkoutAt ? entrega.checkoutAt : instante;
    await tx.licenseCheckout.update({
      where: { id: checkoutId },
      data: { checkinAt },
    });

    await recordAudit(tx, {
      entityType: 'License',
      entityId: entrega.licenseId,
      entityLabel: licenca.name,
      action: 'CHECKIN',
      changes: {
        checkoutId,
        targetType: entrega.assignedPersonId ? 'PERSON' : 'ASSET',
        targetId: entrega.assignedPersonId ?? entrega.assignedAssetId,
        targetName: rotuloDoAlvoDaEntrega(entrega),
        checkinAt: checkinAt.toISOString(),
      },
    }, ator);
  });

  return prisma.licenseCheckout.findUniqueOrThrow({ where: { id: checkoutId }, select: CHECKOUT_SELECT });
}
