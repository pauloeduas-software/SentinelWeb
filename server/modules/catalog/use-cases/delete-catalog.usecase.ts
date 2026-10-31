import { prisma } from '../../../infra/database/prismaClient';
import { AppError } from '../../../infra/errors/app-error';
import { recordAudit } from '../../audit/use-cases/record-audit.usecase';
import type { Ator } from '../../audit/audit.types';
import { buildSnapshot } from '../../shared/diff.helper';
import type { CatalogSpec } from '../specs/catalog-spec.types';

/**
 * Exclui — de verdade, ou para a lixeira na tabela que a tem (`spec.lixeira`).
 *
 * O catálogo não tem lixeira (docs/historico/fase-01-catalogo-e-ativo.md, D8),
 * com UMA exceção: o colaborador, que tem histórico de posse próprio
 * (docs/decisoes/posse.md, V).
 *
 * A proteção é o `countUsages`: linha referenciada por alguém não é apagada, e
 * o cliente recebe 409 dizendo por quantos. É o que o Snipe-IT faz ao recusar
 * apagar uma categoria com item associado. A tabela que precisa dizer O QUÊ, e
 * não quantos, declara `motivoParaNaoExcluir`.
 *
 * O `AuditLog` guarda o retrato da linha em `changes`, então um apagão
 * acidental continua recuperável à mão.
 */
export async function deleteCatalog(spec: CatalogSpec, id: string, ator: Ator): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const delegate = spec.delegate(tx);

    const antes = await delegate.findFirst({ where: { id }, select: spec.select });
    if (!antes) throw new AppError('Registro não encontrado', 404);

    if (spec.motivoParaNaoExcluir) {
      const motivo = await spec.motivoParaNaoExcluir(tx, id);
      if (motivo) throw new AppError(motivo.mensagem, 409, motivo.refs);
    } else {
      const emUso = await spec.countUsages(tx, id);
      if (emUso > 0) {
        const dica = spec.dicaEmUso ? ` ${spec.dicaEmUso}` : '';
        throw new AppError(
          `Não é possível excluir: ${spec.rotulo} em uso por ${emUso} ${emUso === 1 ? 'registro' : 'registros'}.${dica}`,
          409,
        );
      }
    }

    await spec.beforeDelete?.(tx, id);

    if (spec.lixeira) {
      await delegate.update({ where: { id }, data: { deletedAt: new Date() } });
    } else {
      await delegate.delete({ where: { id } });
    }

    await recordAudit(tx, {
      entityType: spec.entityType,
      entityId: id,
      entityLabel: String(antes.name),
      action: 'DELETE',
      changes: buildSnapshot(antes, spec.audited),
    }, ator);
  });
}
