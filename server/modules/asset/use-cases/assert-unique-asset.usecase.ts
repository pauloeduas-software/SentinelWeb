import type { prisma } from '../../../infra/database/prismaClient';
import { AppError } from '../../../infra/errors/app-error';
import { escaparCuringas } from '../../shared/busca.helper';

type ClienteComAsset = Pick<typeof prisma, 'asset'>;

interface Candidato {
  assetTag?: string | null;
  serial?: string | null;
  /** Na edição, a própria linha não conta como conflito. */
  ignorarId?: string;
}

/**
 * Etiqueta e série livres ENTRE OS VIVOS, sem diferença de maiúscula (CN).
 *
 * A unicidade é um índice PARCIAL sobre `lower()` (`WHERE "deletedAt" IS NULL`)
 * escrito à mão na migration, e o Prisma não o conhece: sem esta checagem, a
 * colisão chegaria como violação crua do banco. Ela vira 409 no error-handler de
 * qualquer forma (P2002), mas com a mensagem genérica "Registro já existe." — que
 * não diz se o problema foi a etiqueta ou o número de série.
 *
 * "ABC123" e "abc123" são a mesma máquina: o vínculo com o agente compara a série
 * em minúsculas (`normalizeSerial`), e dois cadastros assim casariam com a mesma
 * máquina, que ficaria sem vínculo por ambiguidade.
 *
 * `findFirst`, e não `findUnique`: o índice parcial não é uma chave única do
 * schema, então o Prisma não aceitaria `findUnique` por estes campos. O `equals`
 * sem caixa vira `ILIKE` no Postgres, e os curingas vão escapados, como no nome
 * do catálogo (`nome-unico.helper.ts`).
 *
 * A série diz QUEM a tem: pode ser um baixado, que continua com ela (a baixa não
 * libera a série), e a etiqueta é o que se busca na lista.
 */
export async function assertEtiquetaESerieLivres(
  client: ClienteComAsset,
  { assetTag, serial, ignorarId }: Candidato,
): Promise<void> {
  const foraEsta = ignorarId ? { id: { not: ignorarId } } : {};
  const igual = (valor: string) => ({ equals: escaparCuringas(valor), mode: 'insensitive' as const });

  if (assetTag) {
    const emUso = await client.asset.findFirst({ where: { assetTag: igual(assetTag), ...foraEsta }, select: { assetTag: true } });
    if (emUso) throw new AppError(`A etiqueta ${emUso.assetTag} já está em uso por outro computador.`, 409);
  }

  if (serial) {
    const emUso = await client.asset.findFirst({
      where: { serial: igual(serial), ...foraEsta }, select: { assetTag: true, serial: true },
    });
    if (emUso) throw new AppError(`O número de série ${emUso.serial} já está em uso por ${emUso.assetTag}.`, 409);
  }
}
