import { AppError } from '../../../core/errors/app-error';
import { escaparCuringas } from '../../shared/busca.helper';
import type { CatalogSpec, ClienteCatalogo } from '../specs/catalog-spec.types';

// O Prisma traduz `equals` + `mode: 'insensitive'` para `ILIKE` no Postgres, e
// lá `%` e `_` são curingas: sem `escaparCuringas`, "Z%" colidia com "Zeta Corp"
// e "Mesa _0" com "Mesa 10".

/**
 * Recusa o nome que já existe com outra grafia — "dell" quando há "Dell".
 *
 * Roda no create e no update, antes do `beforeWrite`. No update só quando o
 * nome ou um campo do escopo vem no corpo: editar o telefone do fabricante não
 * é motivo para conferir o nome de novo.
 *
 * Não fecha a corrida de dois cadastros simultâneos de "Dell" e "dell" — isso
 * pediria índice sobre `lower(name)`, que o Prisma não expressa. O `@unique`
 * fecha a corrida da grafia IGUAL, que é a que acontece de verdade (o
 * duplo clique); a de grafia diferente ao mesmo segundo não é um caso real.
 */
export async function assertNomeLivre(
  spec: CatalogSpec,
  client: ClienteCatalogo,
  id: string | null,
  data: Record<string, unknown>,
  antes: Record<string, unknown> | null,
): Promise<void> {
  const escopo = spec.nomeUnicoPor;
  if (!escopo) return;

  const mexeu = id === null || data.name !== undefined || escopo.some((campo) => data[campo] !== undefined);
  if (!mexeu) return;

  const nome = (data.name ?? antes?.name) as string | undefined;
  if (!nome) return;

  const where: Record<string, unknown> = { name: { equals: escaparCuringas(nome), mode: 'insensitive' } };
  for (const campo of escopo) where[campo] = data[campo] ?? antes?.[campo];
  if (id) where.id = { not: id };

  const existente = await spec.delegate(client).findFirst({ where, select: { name: true } });
  if (existente) {
    const sufixo = escopo.length > 0 ? ' neste tipo' : '';
    throw new AppError(`Já existe ${spec.rotulo} com o nome "${String(existente.name)}"${sufixo}.`, 409);
  }
}
