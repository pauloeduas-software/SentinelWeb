import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { recordActivity } from '../../activity/use-cases/record-activity.usecase';
import {
  MAINTENANCE_SELECT, paraResposta,
  type LinhaDeManutencao, type ManutencaoNaResposta,
} from '../helpers/maintenance-select.helper';
import type { CloseMaintenanceData } from '../schemas/maintenance.schema';
import { assertDatasDaManutencao } from './assert-maintenance-references.usecase';

/** Meia-noite UTC de hoje — o dia de calendário, como o resto do sistema grava. */
function hojeUTC(): Date {
  const hoje = new Date();
  hoje.setUTCHours(0, 0, 0, 0);
  return hoje;
}

/**
 * ENCERRA a manutenção. Um clique, e o padrão é hoje.
 *
 * O 409 de "já encerrada" existe para o caso de duas abas abertas na mesma
 * lista: a segunda perde e recebe a frase, em vez de sobrescrever em silêncio a
 * data que a primeira gravou — que é o dado que o custo acumulado e o alerta de
 * manutenção em aberto leem.
 *
 * `cost` e `notes` entram aqui porque é no encerramento que o valor final se
 * conhece: exigir um PUT depois do clique faria o operador fechar sem custo e
 * quase nunca voltar.
 */
export async function closeMaintenance(
  id: string,
  data: CloseMaintenanceData,
  actorId: string | null,
): Promise<ManutencaoNaResposta> {
  const encerrada = await prisma.$transaction(async (tx) => {
    const antes = await tx.maintenance.findUnique({
      where: { id },
      select: { id: true, assetId: true, startDate: true, completionDate: true, title: true },
    });

    if (!antes) throw new AppError('Manutenção não encontrada.', 404);
    if (antes.completionDate) {
      throw new AppError('Esta manutenção já está encerrada.', 409, {
        completionDate: antes.completionDate.toISOString(),
      });
    }

    const completionDate = data.completionDate ?? hojeUTC();
    assertDatasDaManutencao(antes.startDate, completionDate);

    const depois = await tx.maintenance.update({
      where: { id },
      data: {
        completionDate,
        // `undefined` é "não mexe" no Prisma: quem encerra sem informar custo
        // não apaga o que já estava gravado.
        cost: data.cost,
        notes: data.notes,
        updatedById: actorId,
      },
      select: MAINTENANCE_SELECT,
    }) as LinhaDeManutencao;

    await recordActivity(tx, {
      entityType: 'Maintenance',
      entityId: id,
      action: 'UPDATE',
      changes: { completionDate: { de: null, para: completionDate.toISOString() } },
    }, actorId);

    // A aba Histórico do ATIVO — ver o `SERVICE` da abertura.
    await recordActivity(tx, {
      entityType: 'Asset',
      entityId: antes.assetId,
      action: 'SERVICE_CLOSE',
      changes: { maintenanceId: id, title: antes.title, completionDate: completionDate.toISOString() },
    }, actorId);

    return depois;
  });

  return paraResposta(encerrada);
}
