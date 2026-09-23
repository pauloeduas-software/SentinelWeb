import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { ATTACHMENT_SELECT } from '../helpers/attachment-select.helper';

/**
 * Os anexos de um ativo, mais recente primeiro.
 *
 * Confere o ativo antes de listar porque array vazio responde a duas perguntas
 * diferentes — "não tem anexo" e "esse id não existe" —, o mesmo motivo de
 * `listAssetAssignments`.
 *
 * `findFirst` pelo escopo da lixeira: ativo excluído responde 404 e os anexos
 * dele continuam gravados, esperando a restauração. Soft delete NÃO apaga
 * arquivo — restaurar um ativo tem que devolver a nota fiscal junto.
 */
export async function listAssetAttachments(assetId: string) {
  const ativo = await prisma.asset.findFirst({ where: { id: assetId }, select: { id: true } });
  if (!ativo) throw new AppError('Registro não encontrado', 404);

  return prisma.attachment.findMany({
    where: { assetId },
    select: ATTACHMENT_SELECT,
    orderBy: { createdAt: 'desc' },
  });
}
