import { prisma } from '../../../infra/database/prismaClient';
import { AppError } from '../../../infra/errors/app-error';
import { recordAudit } from '../../audit/use-cases/record-audit.usecase';
import type { Ator } from '../../audit/audit.types';
import { buildSnapshot } from '../../shared/diff.helper';
import type { CatalogSpec } from '../specs/catalog-spec.types';

/**
 * Exclui DE VEZ — só da lixeira, nas tabelas que a têm (`spec.lixeira`, DL).
 *
 * Dois passos, como o GLPI: excluir manda para a lixeira, e daqui a linha sai
 * do banco. O passado que aponta para ela a solta e guarda o nome por escrito
 * (`spec.beforePurge`): o histórico dos outros continua, e some a ficha dela.
 *
 * Fora da lixeira é 404 antes de tudo: o colaborador ativo com algo entregue
 * não está aqui, e o 409 mandaria devolver o que não é o problema.
 *
 * Depois, a recusa pelo que está em uso, porque é ela que trava a linha
 * (`motivoParaNaoExcluir`): a restauração que chega no meio espera, e a
 * releitura da lixeira, depois da trava, é a que vale. Na lixeira nada está em
 * uso (invariante 6), então a recusa é a rede de um banco antigo.
 *
 * O `AuditLog` guarda o retrato da linha em `changes`: é o que sobra dela.
 */
export async function purgeCatalog(spec: CatalogSpec, id: string, ator: Ator): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const delegate = spec.delegate(tx);
    const foraDaLixeira = () => new AppError(
      `${spec.rotulo.charAt(0).toUpperCase()}${spec.rotulo.slice(1)} não está na lixeira.`,
      404,
    );

    if (!await delegate.findFirst({ where: { id, deletedAt: { not: null } }, select: { id: true } })) {
      throw foraDaLixeira();
    }

    const motivo = await spec.motivoParaNaoExcluir?.(tx, id);
    if (motivo) throw new AppError(motivo.mensagem, 409, motivo.refs);

    const naLixeira = await delegate.findFirst({ where: { id, deletedAt: { not: null } }, select: spec.select });
    if (!naLixeira) throw foraDaLixeira();

    await spec.beforePurge?.(tx, id, String(naLixeira.name));
    // `deletedAt` explícito: a extension de soft delete escopa o `delete` também,
    // e sem ele procuraria a linha fora da lixeira.
    await delegate.delete({ where: { id, deletedAt: { not: null } } });

    await recordAudit(tx, {
      entityType: spec.entityType,
      entityId: id,
      entityLabel: String(naLixeira.name),
      action: 'PURGE',
      changes: buildSnapshot(naLixeira, spec.audited),
    }, ator);
  });
}
