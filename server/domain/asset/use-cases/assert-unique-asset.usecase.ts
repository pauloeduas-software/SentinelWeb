import type { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';

type ClienteComAsset = Pick<typeof prisma, 'asset'>;

interface Candidato {
  assetTag?: string | null;
  serial?: string | null;
  /** Na edição, a própria linha não conta como conflito. */
  ignorarId?: string;
}

/**
 * Etiqueta e série livres ENTRE OS VIVOS.
 *
 * A unicidade é um índice PARCIAL (`WHERE deleted_at IS NULL`) escrito à mão na
 * migration, e o Prisma não o conhece: sem esta checagem, a colisão chegaria
 * como violação crua do banco. Ela vira 409 no error-handler de qualquer forma
 * (P2002), mas com a mensagem genérica "Registro já existe" — que não diz se o
 * problema foi a etiqueta ou o número de série.
 *
 * `findFirst`, e não `findUnique`: o índice parcial não é uma chave única do
 * schema, então o Prisma não aceitaria `findUnique` por estes campos. É o mesmo
 * caminho que `createUser` usa para o e-mail desde a Fase 0.
 */
export async function assertEtiquetaESerieLivres(
  client: ClienteComAsset,
  { assetTag, serial, ignorarId }: Candidato,
): Promise<void> {
  const foraEsta = ignorarId ? { id: { not: ignorarId } } : {};

  if (assetTag) {
    const emUso = await client.asset.findFirst({ where: { assetTag, ...foraEsta }, select: { id: true } });
    if (emUso) throw new AppError(`A etiqueta ${assetTag} já está em uso por outro ativo.`, 409);
  }

  if (serial) {
    const emUso = await client.asset.findFirst({ where: { serial, ...foraEsta }, select: { id: true } });
    if (emUso) throw new AppError(`O número de série ${serial} já está em uso por outro ativo.`, 409);
  }
}
