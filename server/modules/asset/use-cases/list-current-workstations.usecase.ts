import { prisma } from '../../../infra/database/prismaClient';

/** O posto da entrega em aberto, com a localização onde ele fica. */
export interface PostoAtual {
  id: string;
  name: string;
  location: { id: string; name: string };
}

/**
 * ONDE O COMPUTADOR ESTÁ, quando está numa mesa (AW).
 *
 * `Asset.locationId` é onde ele fica GUARDADO, e entregar não mexe nele: o
 * computador que saiu do Depósito para a Mesa 1, na Filial, está na Filial. É
 * a localização atual e a padrão do Snipe-IT, só que a atual não é copiada:
 * sai da posse aberta na hora, e o posto que muda de lugar leva o computador
 * junto sem nenhuma atualização em cadeia. Devolvido, volta a valer o guardado.
 *
 * UMA consulta, venham 1 ou 100 ativos: a lista lê a página inteira, e a ficha
 * passa por aqui para as duas não divergirem (BJ). Quem não está em posto fica
 * fora do mapa.
 */
export async function listCurrentWorkstations(assetIds: string[]): Promise<Map<string, PostoAtual>> {
  const posses = await prisma.assignment.findMany({
    where: { assetId: { in: assetIds }, checkinAt: null, targetType: 'WORKSTATION' },
    select: {
      assetId: true,
      targetWorkstation: { select: { id: true, name: true, location: { select: { id: true, name: true } } } },
    },
  });

  const postos = new Map<string, PostoAtual>();
  for (const posse of posses) {
    if (posse.targetWorkstation) postos.set(posse.assetId, posse.targetWorkstation);
  }
  return postos;
}
