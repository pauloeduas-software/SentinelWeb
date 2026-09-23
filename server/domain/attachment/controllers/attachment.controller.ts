import { z } from 'zod';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { AppError } from '../../../core/errors/app-error';
import {
  TAMANHO_MAXIMO_BYTES, ehImagem, extensaoDoMime, tiposAceitos, tiposDeImagemAceitos,
} from '../../../core/storage/mime';
import { atorDaRequisicao } from '../../auth/helpers/actor.helper';
import { idParamSchema } from '../../shared/params.schema';
import { listAssetAttachments } from '../use-cases/list-asset-attachments.usecase';
import { uploadAttachment, type ArquivoRecebido } from '../use-cases/upload-attachment.usecase';
import { deleteAttachment } from '../use-cases/delete-attachment.usecase';
import { downloadAttachment } from '../use-cases/download-attachment.usecase';
import {
  ALVOS_DE_IMAGEM, clearImage, getImagePath, setImage, type AlvoDeImagem,
} from '../use-cases/set-image.usecase';
import { abrir, existe } from '../../../core/storage/storage';

// Só HTTP. A diferença para os outros controllers é que aqui a entrada não é
// JSON: é `multipart/form-data`, e o zod não a valida — quem valida é este
// arquivo, na borda, antes de qualquer byte chegar ao disco.

const alvoParamSchema = z.strictObject({
  alvo: z.enum(ALVOS_DE_IMAGEM as [AlvoDeImagem, ...AlvoDeImagem[]], 'alvo de imagem inválido'),
  id: z.uuid('identificador inválido'),
});

/**
 * Lê o arquivo do corpo multipart e o valida.
 *
 * AS TRÊS RECUSAS, e a ordem importa:
 *
 * 1. **Sem arquivo** → 422. Formulário enviado vazio é erro de quem chamou, não
 *    um upload de zero bytes.
 * 2. **MIME fora da allowlist** → 422 dizendo o que É aceito. Allowlist, nunca
 *    blocklist: uma lista de "o que não pode" está sempre um formato atrás.
 * 3. **Maior que o teto** → 413. O `@fastify/multipart` já corta no `limits`,
 *    mas a checagem aqui é o que transforma o corte num erro com mensagem —
 *    sem ela o `file.truncated` passaria e gravaríamos um PDF pela metade.
 *
 * O `mimetype` vem do CLIENTE e não é confiável; ele serve para escolher a
 * extensão e recusar o que não está na lista, nunca para provar o conteúdo.
 * Quem garante que um `.exe` renomeado não vira executável no servidor é o fato
 * de nada aqui executar arquivo — e de o nome no disco nunca vir de fora.
 */
async function lerArquivo(request: FastifyRequest, apenasImagem: boolean): Promise<ArquivoRecebido> {
  const parte = await request.file({ limits: { fileSize: TAMANHO_MAXIMO_BYTES } });
  if (!parte) throw new AppError('Envie um arquivo no campo "file".', 422);

  const mimeType = parte.mimetype;

  if (apenasImagem && !ehImagem(mimeType)) {
    throw new AppError(
      `Tipo de imagem não aceito: ${mimeType}. Aceitos: ${tiposDeImagemAceitos().join(', ')}.`,
      422,
    );
  }

  if (!extensaoDoMime(mimeType)) {
    throw new AppError(
      `Tipo de arquivo não aceito: ${mimeType}. Aceitos: ${tiposAceitos().join(', ')}.`,
      422,
    );
  }

  const bytes = await parte.toBuffer();

  // `truncated` é como o plugin avisa que cortou no teto. Sem isto, o arquivo
  // seria gravado incompleto e o defeito só apareceria ao abrir o PDF.
  if (parte.file.truncated) {
    throw new AppError(
      `Arquivo maior que o limite de ${Math.round(TAMANHO_MAXIMO_BYTES / 1024 / 1024)} MB.`,
      413,
    );
  }

  if (bytes.byteLength === 0) throw new AppError('O arquivo enviado está vazio.', 422);

  return { bytes, mimeType, originalName: parte.filename || 'arquivo' };
}

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
    const arquivo = await lerArquivo(request, false);
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
    const arquivo = await lerArquivo(request, true);
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
    const tipo = caminho.endsWith('.png') ? 'image/png'
      : caminho.endsWith('.webp') ? 'image/webp'
      : caminho.endsWith('.gif') ? 'image/gif'
      : 'image/jpeg';

    return reply
      .header('Content-Type', tipo)
      .header('Cache-Control', 'private, max-age=0, no-store')
      .send(abrir(caminho));
  },
};
