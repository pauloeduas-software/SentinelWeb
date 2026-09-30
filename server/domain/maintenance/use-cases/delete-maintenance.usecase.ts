import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { recordActivity } from '../../activity/use-cases/record-activity.usecase';
import { buildSnapshot } from '../../shared/diff.helper';
import { MAINTENANCE_AUDITED, MAINTENANCE_SELECT, type LinhaDeManutencao } from '../helpers/maintenance-select.helper';

/**
 * APAGA DE VERDADE — e é a única tabela do ciclo de vida onde isso é possível.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * POR QUE NÃO HÁ LIXEIRA AQUI.
 *
 * `maintenances` não tem `deletedAt` de propósito (a coluna ligaria a extension
 * de soft delete numa tabela que ninguém quer escopada), então "apagar" só pode
 * ser o `DELETE` físico. Isso é aceitável por um motivo específico: a linha não
 * guarda nada que não se reconstrua — diferente do histórico de consumo do
 * estoque (D36) ou da ocupação de assento (F6), aqui não há saldo nem posse
 * pendurada nela.
 *
 * E o que se perde tem testemunha: o RETRATO INTEIRO vai para o `changes` do
 * `DELETE` antes de a linha sumir. É a mesma escolha do `MERGE` da F7 — operação
 * destrutiva e sem desfazer, com o estado anterior no log.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export async function deleteMaintenance(id: string, actorId: string | null): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const manutencao = await tx.maintenance.findUnique({
      where: { id },
      select: MAINTENANCE_SELECT,
    }) as LinhaDeManutencao | null;

    if (!manutencao) throw new AppError('Manutenção não encontrada.', 404);

    await recordActivity(tx, {
      entityType: 'Maintenance',
      entityId: id,
      action: 'DELETE',
      changes: buildSnapshot(manutencao, MAINTENANCE_AUDITED),
    }, actorId);

    await tx.maintenance.delete({ where: { id } });
  });
}
