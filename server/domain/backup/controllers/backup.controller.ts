import { createReadStream } from 'fs';
import fs from 'fs/promises';
import { z } from 'zod';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { AppError } from '../../../core/errors/app-error';
import { caminhoDoDump } from '../helpers/backup-dir.helper';
import { createBackup } from '../use-cases/create-backup.usecase';
import { listBackups } from '../use-cases/list-backups.usecase';
import { pruneBackups } from '../use-cases/prune-backups.usecase';

// Só HTTP.
//
// O `:nome` do download é entrada do cliente e a única desta fatia. Ele não
// chega ao sistema de arquivos sem passar pelo `caminhoDoDump`, que confere a
// FORMA (o nome que nós geramos) e o PREFIXO (o caminho resolvido não saiu da
// pasta). `path.join` sozinho não protege: `join(base, '../../.ssh/id_rsa')`
// sai da base sem reclamar.
const nomeParamSchema = z.strictObject({
  nome: z.string().min(1, 'informe o nome do arquivo'),
});

export const backupController = {
  async list() {
    return listBackups();
  },

  async create(_request: FastifyRequest, reply: FastifyReply) {
    return reply.status(201).send(await createBackup());
  },

  async prune() {
    return pruneBackups();
  },

  async download(request: FastifyRequest, reply: FastifyReply) {
    const { nome } = nomeParamSchema.parse(request.params);
    const caminho = caminhoDoDump(nome);

    // 404 e não 400 para nome fora do formato, de propósito: a resposta é a
    // mesma de um dump que não existe, e as duas são verdade. Distinguir
    // "nome inválido" de "não encontrado" ensinaria, a quem está varrendo, qual
    // forma de nome vale a pena tentar.
    if (!caminho) throw new AppError('Backup não encontrado.', 404);

    let sizeBytes: number;
    try {
      sizeBytes = (await fs.stat(caminho)).size;
    } catch {
      throw new AppError('Backup não encontrado.', 404);
    }

    return reply
      // `octet-stream` e `attachment`: um dump não é para abrir no navegador.
      .header('Content-Type', 'application/octet-stream')
      .header('Content-Length', sizeBytes)
      .header('Content-Disposition', `attachment; filename="${nome}"`)
      .header('Cache-Control', 'private, max-age=0, no-store')
      .send(createReadStream(caminho));
  },
};
