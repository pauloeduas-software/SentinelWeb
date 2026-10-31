import type { Prisma } from '@prisma/client';
import { prisma } from '../../../infra/database/prismaClient';
import { AppError } from '../../../infra/errors/app-error';
import type { ListEnvelope, ListQuery } from '../../../infra/http/list-query';
import { contemTexto } from '../../shared/busca.helper';
import { CHECKOUT_COM_CHAVE_SELECT } from '../helpers/license-select.helper';

type Entrega = Prisma.LicenseCheckoutGetPayload<{ select: typeof CHECKOUT_COM_CHAVE_SELECT }>;

/**
 * QUEM ESTÁ COM ESTA LICENÇA AGORA — a lista do detalhe, com o botão de
 * devolver em cada linha. O que já foi devolvido mora no histórico.
 *
 * Paginada e com busca: um contrato de 500 licenças tem 500 linhas aqui. A
 * busca é pelo nome de quem recebeu — o do colaborador, ou a etiqueta e o nome
 * do computador.
 *
 * É a única lista que devolve a CHAVE de cada entrega: é a do detalhe, onde a
 * tela a mostra escondida.
 */
export async function listLicenseCheckouts(licenseId: string, query: ListQuery): Promise<ListEnvelope<Entrega>> {
  const licenca = await prisma.license.findUnique({ where: { id: licenseId }, select: { id: true } });
  if (!licenca) throw new AppError('Nenhuma licença com este identificador.', 404);

  const contem = query.q ? contemTexto(query.q) : undefined;
  const where: Prisma.LicenseCheckoutWhereInput = {
    licenseId,
    checkinAt: null,
    ...(contem ? {
      OR: [
        { assignedPerson: { name: contem } },
        { assignedAsset: { assetTag: contem } },
        { assignedAsset: { name: contem } },
      ],
    } : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.licenseCheckout.count({ where }),
    prisma.licenseCheckout.findMany({
      where,
      select: CHECKOUT_COM_CHAVE_SELECT,
      // `id` fecha o desempate: duas entregas do mesmo dia passado têm o mesmo
      // `checkoutAt`, e sem ordem total a mesma linha podia aparecer em duas páginas.
      orderBy: [{ checkoutAt: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
      skip: query.skip,
      take: query.take,
    }),
  ]);

  return { total, rows };
}
