import type { FastifyInstance } from 'fastify';
import { createLogger } from '../../core/logger/logger';
import { reportController } from './controllers/report.controller';

const logger = createLogger('report.maestro');

// OS RELATÓRIOS (docs/FASE-8-PLANO-ITAM.md, Etapa D).
//
// TODO GET, E NENHUM ESCREVE. Não é coincidência que valha a pena escrever: um
// relatório que grava é um relatório que muda o que ele mesmo mede, e a primeira
// tentação será materializar um total "para ficar rápido" — que é o D16 de novo,
// com outra roupa.
//
// SEM `WRITE_RATE_LIMIT` porque não há escrita; o teto global de 300/min do
// `@fastify/rate-limit` continua valendo.
//
// A F10 HERDA ESTA MOLDURA: export CSV, seletor de colunas e report builder
// entram aqui, como abas desta mesma página — não numa segunda tela de
// relatórios, que é como duas listas do mesmo dado começam a divergir.
export class ReportMaestro {
  static async setupRoutes(server: FastifyInstance): Promise<void> {
    server.get('/api/reports/depreciacao', reportController.depreciacao);
    server.get('/api/reports/prazos', reportController.prazos);
    server.get('/api/reports/auditorias', reportController.auditorias);
    server.get('/api/reports/manutencoes', reportController.manutencoes);

    logger.info('[Maestro] Rotas de Relatórios inicializadas.');
  }
}
