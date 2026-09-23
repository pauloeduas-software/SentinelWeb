import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { ASSET_SELECT } from '../helpers/asset-select.helper';

/**
 * Busca por número de série — match EXATO, não `contains`.
 *
 * É a rota do leitor de código de barras e da reconciliação com o agente (F7):
 * as duas precisam de "este serial é este ativo, ou não é". Busca aproximada é
 * a da listagem, com `?q=`.
 *
 * `findFirst`, não `findUnique`: a unicidade do serial é índice parcial
 * (`WHERE deleted_at IS NULL`), que o Prisma não conhece — e a extension de
 * soft delete já mantém a lixeira fora daqui.
 */
export async function findAssetBySerial(serial: string) {
  const ativo = await prisma.asset.findFirst({ where: { serial }, select: ASSET_SELECT });
  if (!ativo) throw new AppError(`Nenhum ativo com o número de série ${serial}.`, 404);
  return ativo;
}
