import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { recordAudit } from '../../audit/use-cases/record-audit.usecase';
import type { Ator } from '../../audit/audit.types';
import { CHECKOUT_COM_CHAVE_SELECT, rotuloDoAlvoDaEntrega } from '../helpers/license-select.helper';
import type { CheckoutKeyData } from '../schemas/license.schema';
import { chaveDaEntrega } from './license-keys.usecase';
import { travarLicencaOuFalhar } from './lock-license.usecase';

/**
 * TROCAR A CHAVE DE UMA ENTREGA ABERTA por outra da lista da licença (AC) — e só
 * ela: alvo, datas e observação da entrega não mudam por aqui. É também como a
 * entrega feita antes de a licença ter chaves ganha a sua.
 *
 * TRAVA A LICENÇA, depois a entrega: é a ordem da entrega (que trava a licença
 * e cria a linha), e é o que impede duas trocas simultâneas de tomarem o último
 * lugar da mesma chave — a segunda espera e encontra a chave cheia. A
 * devolução, que trava só a linha, espera esta troca terminar ou é esperada por
 * ela; de todo jeito, a releitura com a linha travada é que decide se ainda
 * está aberta.
 */
export async function updateCheckoutKey(checkoutId: string, data: CheckoutKeyData, ator: Ator) {
  // Sem trava, só para saber QUAL licença travar.
  const previa = await prisma.licenseCheckout.findUnique({
    where: { id: checkoutId }, select: { licenseId: true, licenseName: true },
  });
  if (!previa) throw new AppError('Nenhuma entrega de licença com este identificador.', 404);
  // A da licença excluída (AG) é sempre devolvida: a em uso segura a exclusão.
  const licenseId = previa.licenseId;
  if (!licenseId) {
    throw new AppError(`Esta entrega de "${previa.licenseName}" já foi devolvida: a chave não muda mais.`, 409);
  }

  return prisma.$transaction(async (tx) => {
    await travarLicencaOuFalhar(tx, licenseId);
    await tx.$queryRaw`SELECT id FROM license_checkouts WHERE id = ${checkoutId}::uuid FOR UPDATE`;

    const entrega = await tx.licenseCheckout.findUniqueOrThrow({
      where: { id: checkoutId },
      select: {
        checkinAt: true,
        licenseKeyId: true,
        license: { select: { id: true, name: true } },
        assignedPerson: { select: { name: true } },
        assignedAsset: { select: { assetTag: true, name: true } },
      },
    });
    // Com a licença travada, ela existe: a entrega sem licença é a devolvida.
    const licenca = entrega.license;
    if (entrega.checkinAt || !licenca) {
      throw new AppError(`Esta entrega de "${licenca?.name ?? previa.licenseName}" já foi devolvida: a chave não muda mais.`, 409);
    }

    const licenseKeyId = await chaveDaEntrega(tx, licenca, data.licenseKeyId, checkoutId);

    const atualizada = await tx.licenseCheckout.update({
      where: { id: checkoutId },
      data: { licenseKeyId },
      select: CHECKOUT_COM_CHAVE_SELECT,
    });

    // Qual chave, pelo id: o texto nunca entra na auditoria.
    if (entrega.licenseKeyId !== licenseKeyId) {
      await recordAudit(tx, {
        entityType: 'License',
        entityId: licenseId,
        entityLabel: licenca.name,
        action: 'UPDATE',
        changes: {
          checkoutId,
          targetName: rotuloDoAlvoDaEntrega(entrega),
          licenseKeyId: { de: entrega.licenseKeyId, para: licenseKeyId },
        },
      }, ator);
    }

    return atualizada;
  });
}
