import type { FastifyInstance } from 'fastify';
import { attachmentController } from './controllers/attachment.controller';
import { createLogger } from '../../core/logger/logger';
import { WRITE_RATE_LIMIT } from '../../core/http/write-rate-limit';
import { diretorioDeUpload } from '../../core/storage/storage';

const logger = createLogger('attachment.maestro');

// ARQUIVO DE ATIVO — anexos (lista) e imagem (campo).
//
// TODAS as rotas exigem sessão, inclusive as de LEITURA, e é o ponto do D84:
// nada de `@fastify/static` numa raiz `/uploads/`. Em produção o guard libera
// todo GET fora de `/api`, então uma raiz estática deixaria nota fiscal e
// contrato públicos para quem soubesse o caminho — e só em produção, o que é
// pior, porque em desenvolvimento ninguém veria.
export class AttachmentMaestro {
  static async setupRoutes(server: FastifyInstance): Promise<void> {
    // ANEXOS — uma lista por ativo.
    server.get('/api/assets/:id/attachments', attachmentController.list);
    server.post('/api/assets/:id/attachments', WRITE_RATE_LIMIT, attachmentController.upload);
    server.get('/api/attachments/:id/download', attachmentController.download);
    server.delete('/api/attachments/:id', WRITE_RATE_LIMIT, attachmentController.remove);

    // IMAGEM — um campo, nas quatro tabelas que o têm. `:alvo` é validado
    // contra a allowlist `ALVOS_DE_IMAGEM`, nunca usado para montar consulta.
    server.get('/api/images/:alvo/:id', attachmentController.getImage);
    server.put('/api/images/:alvo/:id', WRITE_RATE_LIMIT, attachmentController.setImage);
    server.delete('/api/images/:alvo/:id', WRITE_RATE_LIMIT, attachmentController.clearImage);

    logger.info(`[Maestro] Rotas de Arquivo inicializadas. UPLOAD_DIR: ${diretorioDeUpload()}`);
  }
}
