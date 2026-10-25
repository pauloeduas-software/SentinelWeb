import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { CHECKOUT_COM_CHAVE_SELECT } from '../helpers/license-select.helper';
import type { CheckoutKeyData } from '../schemas/license.schema';
import { assertChaveLivre } from './checkout-license.usecase';
import { travarLicencaOuFalhar } from './lock-license.usecase';

/**
 * TROCAR A CHAVE DE UMA ENTREGA ABERTA — e só ela: alvo, datas e observação da
 * entrega não mudam por aqui.
 *
 * TRAVA A LICENÇA, depois a entrega: é a ordem da entrega (que trava a licença
 * e cria a linha), e é o que impede duas trocas simultâneas de pôr a mesma chave
 * em duas entregas — a segunda espera e encontra a chave tomada. A devolução,
 * que trava só a linha, espera esta troca terminar ou é esperada por ela; de
 * todo jeito, a releitura com a linha travada é que decide se ainda está aberta.
 */
export async function updateCheckoutKey(checkoutId: string, data: CheckoutKeyData) {
  // Sem trava, só para saber QUAL licença travar.
  const previa = await prisma.licenseCheckout.findUnique({ where: { id: checkoutId }, select: { licenseId: true } });
  if (!previa) throw new AppError('Nenhuma entrega de licença com este identificador.', 404);

  return prisma.$transaction(async (tx) => {
    await travarLicencaOuFalhar(tx, previa.licenseId);
    await tx.$queryRaw`SELECT id FROM license_checkouts WHERE id = ${checkoutId}::uuid FOR UPDATE`;

    const entrega = await tx.licenseCheckout.findUniqueOrThrow({
      where: { id: checkoutId },
      select: { checkinAt: true, license: { select: { name: true } } },
    });
    if (entrega.checkinAt) {
      throw new AppError(`Esta entrega de "${entrega.license.name}" já foi devolvida: a chave não muda mais.`, 409);
    }

    await assertChaveLivre(tx, previa.licenseId, entrega.license.name, data.productKey, checkoutId);

    return tx.licenseCheckout.update({
      where: { id: checkoutId },
      data: { productKey: data.productKey ?? null },
      select: CHECKOUT_COM_CHAVE_SELECT,
    });
  });
}
