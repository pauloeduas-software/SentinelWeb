import { Prisma } from '@prisma/client';
import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { recordAudit } from '../../audit/use-cases/record-audit.usecase';
import type { Ator } from '../../audit/audit.types';
import { buildChanges } from '../../shared/diff.helper';
import { assertVersaoLida } from '../../shared/versao.helper';
import { assertNomeLivre } from '../helpers/nome-unico.helper';
import type { CatalogSpec } from '../specs/catalog-spec.types';

export async function updateCatalog(
  spec: CatalogSpec,
  id: string,
  data: Record<string, unknown>,
  ator: Ator,
): Promise<Record<string, unknown>> {
  // A versão que o formulário leu não é campo da tabela: sai antes da gravação.
  const { updatedAt: lida, ...campos } = data as Record<string, unknown> & { updatedAt?: Date };

  return prisma.$transaction(async (tx) => {
    const delegate = spec.delegate(tx);

    const antes = await delegate.findFirst({ where: { id }, select: spec.select });
    if (!antes) throw new AppError('Registro não encontrado', 404);
    // Já aqui, sem trava, para o formulário velho receber ESTA frase, e não a
    // de uma regra que ele só quebra por estar velho. A que vale é a de baixo.
    assertVersaoLida(antes.updatedAt as Date, lida, String(antes.name));

    await assertNomeLivre(spec, tx, id, campos, antes);
    await spec.beforeWrite?.(tx, id, campos);

    // O "de" da auditoria, relido com a linha travada: o de cima foi lido sem
    // trava, e uma edição simultânea confirmada no meio faria a linha dizer "de
    // A" quando a mudança foi de B. É a trava do UPDATE logo abaixo, tomada um
    // passo antes — e depois das do `beforeWrite`, para não mudar a ordem delas.
    await tx.$queryRaw`SELECT id FROM ${Prisma.raw(`"${spec.tabela}"`)} WHERE id = ${id}::uuid FOR NO KEY UPDATE`;
    const travado = await delegate.findFirst({ where: { id }, select: spec.select });
    if (!travado) throw new AppError('Registro não encontrado', 404);
    assertVersaoLida(travado.updatedAt as Date, lida, String(travado.name));

    const depois = await delegate.update({ where: { id }, data: campos, select: spec.select });

    // Só o que REALMENTE mudou vai para o log: gravar o registro inteiro a cada
    // edição transformaria o histórico em cópia da tabela.
    const changes = buildChanges(travado, depois, spec.audited);
    if (Object.keys(changes).length > 0) {
      await recordAudit(tx, {
        entityType: spec.entityType,
        entityId: id,
        entityLabel: String(depois.name),
        action: 'UPDATE',
        changes,
      }, ator);
    }

    return depois;
  });
}
