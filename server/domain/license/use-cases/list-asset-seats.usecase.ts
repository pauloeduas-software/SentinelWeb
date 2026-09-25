import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';

/**
 * AS LICENÇAS DESTE ATIVO — a aba Licenças da tela de detalhe (F2, adiada).
 *
 * Pendura em `/api/assets/:id` como as rotas de posse e de componente fazem, e
 * pelo mesmo motivo: o dono do conceito é este domínio, não o do ativo.
 *
 * Só as ocupações ABERTAS: a aba responde "o que está licenciado nesta máquina
 * agora". O histórico de quem esteve nela fica na trilha da licença.
 */
export async function listAssetSeats(assetId: string) {
  const ativo = await prisma.asset.findFirst({ where: { id: assetId }, select: { id: true } });
  if (!ativo) throw new AppError('Nenhum ativo com este identificador.', 404);

  return prisma.licenseSeatCheckout.findMany({
    where: {
      assignedAssetId: assetId,
      checkinAt: null,
      // Licença na lixeira não aparece na aba: ela não existe para o
      // inventário, e mostrá-la ofereceria uma devolução que a tela da licença
      // não tem como completar.
      seat: { license: { deletedAt: null } },
    },
    select: {
      id: true,
      checkoutAt: true,
      checkoutNotes: true,
      seat: {
        select: {
          id: true, seatNumber: true,
          license: {
            select: {
              id: true, name: true, seatsTotal: true,
              expirationDate: true, terminationDate: true, reassignable: true,
              category: { select: { name: true } },
              manufacturer: { select: { name: true } },
            },
          },
        },
      },
    },
    orderBy: { checkoutAt: 'desc' },
  });
}
