import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import {
  LICENSE_SELECT, paraResposta,
  type LicencaNaResposta, type LinhaDeLicenca,
} from '../helpers/license-select.helper';
import { contarUsoDe } from './count-license-checkouts.usecase';
import { listarChaves, type ChaveNaResposta } from './license-keys.usecase';

/**
 * UMA licença, com a contagem — e as CHAVES DE PRODUTO, cada uma com quanto
 * cobre e quanto está em uso (AC). É a única leitura da licença que as devolve:
 * é a do detalhe, onde a tela as mostra escondidas, e a da entrega, que escolhe
 * uma delas.
 */
export async function getLicense(id: string): Promise<LicencaNaResposta & { keys: ChaveNaResposta[] }> {
  const licenca = await prisma.license.findUnique({
    where: { id },
    select: LICENSE_SELECT,
  }) as LinhaDeLicenca | null;

  if (!licenca) throw new AppError('Nenhuma licença com este identificador.', 404);

  const [uso, keys] = await Promise.all([contarUsoDe(prisma, id), listarChaves(prisma, id)]);
  return { ...paraResposta(licenca, uso), keys };
}
