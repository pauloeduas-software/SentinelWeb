import type { FastifyInstance } from 'fastify';
import { createLogger } from '../../core/logger/logger';
import { EXPORT_RATE_LIMIT, WRITE_RATE_LIMIT } from '../../core/http/write-rate-limit';
import { labelController } from './controllers/label.controller';

const logger = createLogger('label.maestro');

// ETIQUETAS, QR E CÓDIGO DE BARRAS (docs/FASE-10-PLANO-ITAM.md, Etapa G).
//
// O PREVIEW E A FOLHA SÃO A MESMA FUNÇÃO, e por isso são rotas gêmeas: a
// diferença é uma página contra todas, e `inline` contra `attachment`. Um
// preview desenhado em HTML discordaria do arquivo — e o objetivo declarado da
// tela é NÃO GASTAR A FOLHA.
//
// `POST` nas duas, apesar de serem leitura: o corpo carrega a lista de ativos e
// o layout inteiro. Com `GET`, 500 uuids e dez medidas iriam na query string —
// e o layout EDITADO (não o salvo) é o que o preview precisa desenhar.
//
// TETO DE EXPORT no preview, e não o de escrita: ele é chamado a cada ajuste do
// formulário (com debounce na tela), e cada chamada renderiza um PDF com N
// imagens geradas em processo. O teto de 10/min é o mesmo do CSV, pelo mesmo
// motivo: é caro, não é perigoso.
export class LabelMaestro {
  static async setupRoutes(server: FastifyInstance): Promise<void> {
    server.get('/api/labels/layout', labelController.layout);
    server.put('/api/labels/layout', WRITE_RATE_LIMIT, labelController.salvarLayout);

    server.post('/api/labels/preview', EXPORT_RATE_LIMIT, labelController.preview);
    server.post('/api/labels/sheet', EXPORT_RATE_LIMIT, labelController.folha);

    logger.info('[Maestro] Rotas de Etiqueta inicializadas.');
  }
}
