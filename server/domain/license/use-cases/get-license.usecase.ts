import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { contarAssentosDe } from '../helpers/license-seats.helper';
import {
  LICENSE_SELECT, paraResposta,
  type LicencaNaResposta, type LinhaDeLicenca,
} from '../helpers/license-select.helper';

/**
 * UMA licença, com a contagem de assentos.
 *
 * `findFirst` e nunca `findUnique`: o escopo da lixeira não alcança o
 * `findUnique` (`core/database/soft-delete.extension.ts`), e a tela de detalhe
 * de uma licença apagada abriria como se ela estivesse ativa.
 */
export async function getLicense(id: string): Promise<LicencaNaResposta> {
  const licenca = await prisma.license.findFirst({
    where: { id },
    select: LICENSE_SELECT,
  }) as LinhaDeLicenca | null;

  if (!licenca) throw new AppError('Nenhuma licença com este identificador.', 404);

  return paraResposta(licenca, await contarAssentosDe(prisma, id));
}
