import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { recordActivity } from '../../activity/use-cases/record-activity.usecase';
import { buildChanges } from '../../shared/diff.helper';
import {
  MAINTENANCE_AUDITED, MAINTENANCE_SELECT, paraResposta,
  type LinhaDeManutencao, type ManutencaoNaResposta,
} from '../helpers/maintenance-select.helper';
import type { UpdateMaintenanceData } from '../schemas/maintenance.schema';
import {
  assertDatasDaManutencao, assertFornecedorDaManutencao,
} from './assert-maintenance-references.usecase';

/**
 * EDITA — e a checagem de data é do ESTADO FINAL, não do que veio no corpo.
 *
 * `startDate ?? atual.startDate` é o que torna a borda confiável numa edição
 * parcial: quem manda só `completionDate` está comparando contra a abertura que
 * já está no banco, e quem manda só `startDate` está mexendo no lado de baixo de
 * uma comparação cujo lado de cima ele não enviou. As duas direções erram, e as
 * duas são pegas aqui.
 */
export async function updateMaintenance(
  id: string,
  data: UpdateMaintenanceData,
  actorId: string | null,
): Promise<ManutencaoNaResposta> {
  const atualizada = await prisma.$transaction(async (tx) => {
    const antes = await tx.maintenance.findUnique({
      where: { id },
      select: MAINTENANCE_SELECT,
    }) as LinhaDeManutencao | null;

    if (!antes) throw new AppError('Manutenção não encontrada.', 404);

    await assertFornecedorDaManutencao(tx, data.supplierId);
    assertDatasDaManutencao(
      data.startDate ?? antes.startDate,
      data.completionDate === undefined ? antes.completionDate : data.completionDate,
    );

    const depois = await tx.maintenance.update({
      where: { id },
      data: { ...data, updatedById: actorId },
      select: MAINTENANCE_SELECT,
    }) as LinhaDeManutencao;

    // Só grava log se ALGO mudou: um PUT que não muda nada não é evento, e
    // registrá-lo transformaria o histórico em contador de cliques.
    const changes = buildChanges(antes, depois, MAINTENANCE_AUDITED);
    if (Object.keys(changes).length > 0) {
      await recordActivity(tx, {
        entityType: 'Maintenance',
        entityId: id,
        action: 'UPDATE',
        changes,
      }, actorId);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ENCERRAR E REABRIR PELO PUT TAMBÉM APARECEM NO HISTÓRICO DO ATIVO.
    //
    // `closeMaintenance` grava `SERVICE_CLOSE` em `entityType: 'Asset'`, porque a
    // aba Histórico do notebook é a única tela que responde "o que aconteceu com
    // este equipamento". O PUT alcança a MESMA coluna e não gravava nada lá: dava
    // para encerrar uma manutenção — e reabrir — sem deixar rastro na única tela
    // onde alguém procuraria, e sem passar pelo 409 de "já encerrada".
    //
    // Consertado pelo lado do LOG e não proibindo o campo: corrigir uma data de
    // encerramento digitada errada é edição legítima, e o `closeMaintenance`
    // continua sendo o caminho de um clique (com o 409 e o padrão de hoje). O que
    // não pode é o fato existir sem testemunha.
    //
    // A transição é comparada, não o corpo recebido: um PUT que reenvia a mesma
    // `completionDate` não é evento nenhum.
    // ═══════════════════════════════════════════════════════════════════════
    const estavaAberta = antes.completionDate === null;
    const ficouAberta = depois.completionDate === null;

    if (estavaAberta !== ficouAberta) {
      await recordActivity(tx, {
        entityType: 'Asset',
        entityId: depois.assetId,
        // Reabrir é o serviço voltando a existir, e é o mesmo verbo da abertura:
        // um valor novo de enum para um caso raro seria uma coluna de enum a mais
        // no banco para a tela tratar igual.
        action: ficouAberta ? 'SERVICE' : 'SERVICE_CLOSE',
        changes: {
          maintenanceId: id,
          title: depois.title,
          completionDate: depois.completionDate?.toISOString() ?? null,
          ...(ficouAberta ? { reaberta: true } : {}),
        },
      }, actorId);
    }

    return depois;
  });

  return paraResposta(atualizada);
}
