import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import {
  LICENSE_DETAIL_SELECT, paraResposta,
  type LicencaNaResposta, type LinhaDeLicenca,
} from '../helpers/license-select.helper';
import { contarUsoDe } from './count-license-checkouts.usecase';

/**
 * UMA licença, com a contagem — e a CHAVE DE PRODUTO. É a única leitura da
 * licença que a devolve: é a do detalhe, onde a tela a mostra escondida.
 */
export async function getLicense(id: string): Promise<LicencaNaResposta & { productKey: string | null }> {
  const licenca = await prisma.license.findUnique({
    where: { id },
    select: LICENSE_DETAIL_SELECT,
  }) as (LinhaDeLicenca & { productKey: string | null }) | null;

  if (!licenca) throw new AppError('Nenhuma licença com este identificador.', 404);

  return paraResposta(licenca, await contarUsoDe(prisma, id));
}
