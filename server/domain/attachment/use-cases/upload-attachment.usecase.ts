import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { apagar, gravar } from '../../../core/storage/storage';
import { recordActivity } from '../../activity/use-cases/record-activity.usecase';
import { ATTACHMENT_SELECT } from '../helpers/attachment-select.helper';

export interface ArquivoRecebido {
  bytes: Buffer;
  originalName: string;
  mimeType: string;
}

/**
 * Anexa um arquivo a um ativo.
 *
 * A ORDEM É: valida → grava o ARQUIVO → grava a LINHA → e, se a linha falhar,
 * apaga o arquivo. É o inverso do que a Etapa G da F2 descreveu ("grava a
 * linha, commita, só então move do temporário"), e a troca é deliberada: o
 * `@fastify/multipart` já entrega os bytes em memória, então não há temporário
 * para mover — e gravar a linha primeiro deixaria, numa falha de disco, um
 * anexo visível na tela cujo download responde 404. Órfão no disco é invisível
 * e recuperável; linha órfã no banco é defeito na cara do usuário.
 *
 * O `ActivityLog` entra na MESMA transação da linha, como em todo o resto.
 */
export async function uploadAttachment(
  assetId: string,
  arquivo: ArquivoRecebido,
  actorId: string | null,
) {
  const ativo = await prisma.asset.findFirst({ where: { id: assetId }, select: { id: true } });
  if (!ativo) throw new AppError('Registro não encontrado', 404);

  const gravado = await gravar('anexos', arquivo.mimeType, arquivo.bytes);

  try {
    return await prisma.$transaction(async (tx) => {
      const anexo = await tx.attachment.create({
        data: {
          assetId,
          path: gravado.path,
          originalName: arquivo.originalName,
          mimeType: arquivo.mimeType,
          sizeBytes: gravado.sizeBytes,
          uploadedById: actorId,
        },
        select: ATTACHMENT_SELECT,
      });

      await recordActivity(tx, {
        entityType: 'Asset',
        entityId: assetId,
        action: 'ATTACH',
        changes: {
          attachmentId: anexo.id,
          originalName: anexo.originalName,
          mimeType: anexo.mimeType,
          sizeBytes: anexo.sizeBytes,
        },
      }, actorId);

      return anexo;
    });
  } catch (error) {
    // A transação reverteu: o arquivo no disco não tem mais dono.
    await apagar(gravado.path);
    throw error;
  }
}
