import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { apagar } from '../../../core/storage/storage';
import { recordActivity } from '../../activity/use-cases/record-activity.usecase';

/**
 * Apaga um anexo — a linha E o arquivo.
 *
 * DELETE REAL, sem lixeira: `Attachment` não tem `deletedAt`. Um anexo na
 * lixeira teria de manter o arquivo no disco indefinidamente sem aparecer em
 * lugar nenhum, e o motivo de apagar um anexo é sempre o mesmo — subiu o
 * arquivo errado. O `ActivityLog` guarda o retrato, então o que se perde é o
 * conteúdo, não o registro de que existiu.
 *
 * O ARQUIVO SAI DEPOIS DO COMMIT, e `apagar` não lança: apagar o arquivo antes
 * deixaria, numa transação que reverte, uma linha viva apontando para o vazio.
 */
export async function deleteAttachment(id: string, actorId: string | null) {
  const anexo = await prisma.attachment.findUnique({
    where: { id },
    select: { id: true, assetId: true, path: true, originalName: true, mimeType: true, sizeBytes: true },
  });
  if (!anexo) throw new AppError('Anexo não encontrado.', 404);

  await prisma.$transaction(async (tx) => {
    await tx.attachment.delete({ where: { id } });

    await recordActivity(tx, {
      entityType: 'Asset',
      entityId: anexo.assetId,
      action: 'DETACH',
      changes: {
        attachmentId: anexo.id,
        originalName: anexo.originalName,
        mimeType: anexo.mimeType,
        sizeBytes: anexo.sizeBytes,
      },
    }, actorId);
  });

  await apagar(anexo.path);

  return { success: true };
}
