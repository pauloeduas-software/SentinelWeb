import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { CHECKOUT_SELECT } from '../helpers/license-select.helper';
import { diasParaVencer, statusDaLicenca } from '../helpers/license-status.helper';

// AS LICENÇAS DE UM ALVO — o que a aba Licenças do ativo, a ficha do
// colaborador e os dois históricos leem.
//
// SEPARADAS POR ALVO, e nunca somadas (AA): a licença entregue ao computador é
// do computador, e não aparece na pessoa que responde por ele; a entregue à
// pessoa é dela, e não aparece no computador que ela usa.

interface Filtro {
  /** Só as abertas (o que está lá agora), ou todas (o histórico). */
  abertas: boolean;
}

/**
 * Do mais recente para o mais antigo. `createdAt` desempata entregas com o
 * mesmo `checkoutAt`, como em `listAssetAssignments`.
 */
function buscar(where: { assignedAssetId: string } | { assignedPersonId: string }, { abertas }: Filtro) {
  return prisma.licenseCheckout.findMany({
    where: { ...where, ...(abertas ? { checkinAt: null } : {}) },
    select: CHECKOUT_SELECT,
    orderBy: [{ checkoutAt: 'desc' }, { createdAt: 'desc' }],
  });
}

export function buscarEntregasDoAtivo(assetId: string, filtro: Filtro) {
  return buscar({ assignedAssetId: assetId }, filtro);
}

export function buscarEntregasDaPessoa(personId: string, filtro: Filtro) {
  return buscar({ assignedPersonId: personId }, filtro);
}

export type EntregaDoAlvo = Awaited<ReturnType<typeof buscarEntregasDoAtivo>>[number];

/**
 * As abertas, com o status da licença ao lado: a aba do ativo e a ficha
 * mostram "venceu há 3 dias" na linha, sem a tela recalcular datas.
 */
export function comStatus(entregas: EntregaDoAlvo[]) {
  return entregas.map((entrega) => ({
    ...entrega,
    status: entrega.license ? statusDaLicenca(entrega.license) : null,
    diasParaVencer: entrega.license ? diasParaVencer(entrega.license.expirationDate) : null,
  }));
}

/** A aba Licenças do ativo: o que está nesta máquina agora. */
export async function listAssetLicenses(assetId: string) {
  const ativo = await prisma.asset.findFirst({ where: { id: assetId }, select: { id: true } });
  if (!ativo) throw new AppError('Ativo não encontrado.', 404);

  return comStatus(await buscarEntregasDoAtivo(assetId, { abertas: true }));
}
