import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { SEAT_SELECT } from '../helpers/license-select.helper';

/**
 * OS ASSENTOS DE UMA LICENÇA — a grade da tela de detalhe.
 *
 * Cada assento vem com a ocupação ABERTA embutida, e no máximo uma: quem
 * garante é `license_seat_uma_aberta_por_assento`, o índice único parcial. Sem
 * ele, `checkouts` seria um array de tamanho imprevisível e a tela teria que
 * escolher qual mostrar — que é a pergunta que a invariante existe para não
 * deixar nascer.
 *
 * ORDENADO POR `seatNumber`, sempre. A grade é lida como uma sequência ("o 7
 * está livre"), e uma ordem que mude entre duas aberturas da tela faria a
 * pessoa clicar no assento errado.
 *
 * OS APOSENTADOS VÊM JUNTO, e é de propósito: eles explicam por que a grade tem
 * mais quadrados que o contrato. Escondê-los deixaria a tela com um buraco na
 * numeração — assentos 1, 2, 3, 6, 7 — sem nada que dissesse por quê.
 */
export async function listLicenseSeats(licenseId: string) {
  // `findFirst` pelo escopo da lixeira: os assentos de uma licença apagada não
  // são listados, do mesmo jeito que a licença não é.
  const licenca = await prisma.license.findFirst({
    where: { id: licenseId },
    select: { id: true },
  });
  if (!licenca) throw new AppError('Nenhuma licença com este identificador.', 404);

  return prisma.licenseSeat.findMany({
    where: { licenseId },
    select: SEAT_SELECT,
    orderBy: { seatNumber: 'asc' },
  });
}
