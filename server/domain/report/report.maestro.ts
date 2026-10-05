import type { FastifyInstance } from 'fastify';
import { createLogger } from '../../core/logger/logger';
import { reportController } from './controllers/report.controller';

const logger = createLogger('report.maestro');

// OS RELATÓRIOS (docs/historico/fase-08-ciclo-de-vida.md, Etapa D).
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

    // A CAMADA 3 AGREGADA (F10, Etapa F). As duas leem a view
    // `vw_asset_responsibles`, que o Prisma não conhece — ver o D66 e a
    // migration `20261001160000_view_responsaveis`.
    server.get('/api/reports/responsabilidade', reportController.responsabilidade);
    server.get('/api/reports/builder/fields', reportController.camposDoBuilder);

    // `POST` numa rota que só LÊ: a lista de colunas é um array, e ela não cabe
    // numa query string sem ambiguidade. Nada aqui grava — e por isso não há
    // `WRITE_RATE_LIMIT`; vale o teto global de 300/min.
    server.post('/api/reports/custom', reportController.custom);

    // O POSTO VAGO E OS ATIVOS POR POSTO **NÃO NASCEM AQUI** (D130).
    //
    // O plano da fase os listava como relatórios desta etapa, saindo da view. A
    // execução encontrou os dois já respondidos desde a F4/F7, e por quem deve
    // respondê-los: `GET /api/workstations?view=vagos` é o posto vago, com a
    // definição que `ehPostoVago()` guarda, e a mesma listagem traz
    // `totalAtivos`/`totalOcupantes` por posto. Uma terceira versão aqui seria o
    // D16 pela terceira vez na mesma fase — e a view nem responde a primeira:
    // posto SEM ocupante não produz linha nela, por construção.
    //
    // A tela de relatórios aponta para `/postos` em vez de duplicar a consulta.

    logger.info('[Maestro] Rotas de Relatórios inicializadas.');
  }
}
