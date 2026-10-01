import { z } from 'zod';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { AppError } from '../../../core/errors/app-error';
import { atorDaRequisicao } from '../../auth/helpers/actor.helper';
import { idParamSchema } from '../../shared/params.schema';
import { listAssetAttachments } from '../use-cases/list-asset-attachments.usecase';
import { uploadAttachment } from '../use-cases/upload-attachment.usecase';
import { lerArquivo } from '../../shared/multipart.helper';
import { deleteAttachment } from '../use-cases/delete-attachment.usecase';
import { downloadAttachment } from '../use-cases/download-attachment.usecase';
import {
  ALVOS_DE_IMAGEM, clearImage, getImagePath, setImage, type AlvoDeImagem,
} from '../use-cases/set-image.usecase';
import { abrir, existe } from '../../../core/storage/storage';
import { mimeDoArquivo } from '../../../core/storage/mime';

// Só HTTP. A diferença para os outros controllers é que aqui a entrada não é
// JSON: é `multipart/form-data`, e o zod não a valida.
//
// QUEM VALIDA É `domain/shared/multipart.helper.ts`, na borda, antes de
// qualquer byte chegar ao disco. Ele saiu deste arquivo quando a marca da F10
// (logo e favicon) e o CSV do importador passaram a precisar das mesmas quatro
// recusas: copiada, a allowlist de tipo divergiria justamente onde não pode.

const alvoParamSchema = z.strictObject({
  alvo: z.enum(ALVOS_DE_IMAGEM as [AlvoDeImagem, ...AlvoDeImagem[]], 'alvo de imagem inválido'),
  id: z.uuid('identificador inválido'),
});

/**
 * Manda o arquivo pela resposta.
 *
 * `Content-Disposition` com o nome ORIGINAL: o que está no disco é um uuid, e
 * baixar `a3f1c2….pdf` obrigaria a pessoa a renomear à mão. O nome vai entre
 * aspas e com as aspas internas removidas — um `"` no nome quebraria o
 * cabeçalho e o navegador leria o resto como outro parâmetro.
 */
function responderArquivo(
  reply: FastifyReply,
  arquivo: { mimeType: string; originalName: string; sizeBytes: number },
  stream: NodeJS.ReadableStream,
  inline: boolean,
) {
  const nome = arquivo.originalName.replace(/["\\]/g, '');
  return reply
    .header('Content-Type', arquivo.mimeType)
    .header('Content-Length', arquivo.sizeBytes)
    .header('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="${nome}"`)
    // Sem cache compartilhado: a resposta passou por uma checagem de sessão, e
    // um proxy que a guardasse a entregaria para a próxima pessoa.
    .header('Cache-Control', 'private, max-age=0, no-store')
    .send(stream);
}

export const attachmentController = {
  async list(request: FastifyRequest) {
    const { id } = idParamSchema.parse(request.params);
    return listAssetAttachments(id);
  },

  async upload(request: FastifyRequest, reply: FastifyReply) {
    const { id } = idParamSchema.parse(request.params);
    const arquivo = await lerArquivo(request);
    const anexo = await uploadAttachment(id, arquivo, atorDaRequisicao(request));
    return reply.status(201).send(anexo);
  },

  async download(request: FastifyRequest, reply: FastifyReply) {
    const { id } = idParamSchema.parse(request.params);
    const { anexo, stream } = await downloadAttachment(id);
    return responderArquivo(reply, anexo, stream, false);
  },

  async remove(request: FastifyRequest) {
    const { id } = idParamSchema.parse(request.params);
    return deleteAttachment(id, atorDaRequisicao(request));
  },

  async setImage(request: FastifyRequest) {
    const { alvo, id } = alvoParamSchema.parse(request.params);
    const arquivo = await lerArquivo(request, { apenasImagem: true });
    return setImage(alvo, id, arquivo, atorDaRequisicao(request));
  },

  async clearImage(request: FastifyRequest) {
    const { alvo, id } = alvoParamSchema.parse(request.params);
    return clearImage(alvo, id, atorDaRequisicao(request));
  },

  async getImage(request: FastifyRequest, reply: FastifyReply) {
    const { alvo, id } = alvoParamSchema.parse(request.params);
    const caminho = await getImagePath(alvo, id);

    // A MESMA conferência do download de anexo, e pelo mesmo motivo: a coluna
    // pode apontar para um arquivo que não está mais no disco (alguém limpou o
    // `UPLOAD_DIR`, ou o backup voltou só o banco). Sem ela o `createReadStream`
    // estouraria DEPOIS de a resposta já ter começado, e o cliente receberia
    // uma imagem truncada em vez de um erro.
    if (!(await existe(caminho))) {
      throw new AppError('A imagem deste registro não está mais no servidor.', 404);
    }

    // `inline` e não `attachment`: imagem é para APARECER na tela, num `<img>`,
    // não para ser baixada. O tipo sai da extensão do arquivo que nós mesmos
    // gravamos, e não de um `mimetype` guardado — a coluna é só o caminho.
    return reply
      .header('Content-Type', mimeDoArquivo(caminho))
      .header('Cache-Control', 'private, max-age=0, no-store')
      .send(abrir(caminho));
  },
};
