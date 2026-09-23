import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { abrir, existe } from '../../../core/storage/storage';

/**
 * Abre um anexo para transmissão — o caminho que o D84 escolheu no lugar de uma
 * raiz estática.
 *
 * Passar por aqui custa uma consulta e um `stream` por download, contra um
 * `sendFile` direto. É o preço de a resposta a "quem pode ler este arquivo?"
 * não depender de `NODE_ENV`: com `@fastify/static` numa raiz `/uploads/`, o
 * guard da F3 liberaria todo GET fora de `/api` em produção, e nota fiscal,
 * contrato e termo assinado ficariam públicos para quem soubesse o caminho.
 *
 * 404 quando a LINHA existe e o ARQUIVO não: é o órfão ao contrário (alguém
 * limpou o `UPLOAD_DIR`, ou o backup voltou só o banco). Sem esta checagem o
 * `createReadStream` estouraria depois de a resposta já ter começado, e o
 * cliente receberia um arquivo truncado em vez de um erro.
 */
export async function downloadAttachment(id: string) {
  const anexo = await prisma.attachment.findUnique({
    where: { id },
    select: { id: true, path: true, originalName: true, mimeType: true, sizeBytes: true },
  });
  if (!anexo) throw new AppError('Anexo não encontrado.', 404);

  if (!(await existe(anexo.path))) {
    throw new AppError('O arquivo deste anexo não está mais no servidor.', 404);
  }

  return { anexo, stream: abrir(anexo.path) };
}
