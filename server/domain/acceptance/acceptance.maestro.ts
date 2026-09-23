import type { FastifyInstance } from 'fastify';
import { acceptanceController } from './controllers/acceptance.controller';
import { createLogger } from '../../core/logger/logger';
import { WRITE_RATE_LIMIT } from '../../core/http/write-rate-limit';

const logger = createLogger('acceptance.maestro');

// O TERMO DE ENTREGA. Metade das rotas é pública e metade exige sessão, e a
// linha entre as duas é o token.
//
// AS PÚBLICAS FICAM SOB `/api/aceite/`, e não sob `/aceite/`, porque `/aceite/`
// JÁ É a rota da PÁGINA no React Router. Registrá-las lá criaria uma colisão
// que só aparece em produção: o Fastify resolve `/aceite/:token` pelo handler
// da API antes de chegar ao `/*` que entrega o `index.html`, e o navegador
// receberia JSON no lugar da tela. Em desenvolvimento nada disso aconteceria —
// o proxy do Vite só encaminha `/api` e `/agent-hub` —, então o defeito
// nasceria invisível para quem o introduziu.
//
// Ficar sob `/api` não as fecha: a porta do D22 nega por padrão e a exceção
// está escrita em `server/app.ts`, com o motivo, que é onde a Etapa C da F3
// mandou escrever.
export class AcceptanceMaestro {
  static async setupRoutes(server: FastifyInstance): Promise<void> {
    // PÚBLICAS — autorizadas pelo token, não por sessão.
    server.get('/api/aceite/:token', acceptanceController.verPorToken);
    server.post('/api/aceite/:token/aceitar', WRITE_RATE_LIMIT, acceptanceController.aceitar);
    server.post('/api/aceite/:token/recusar', WRITE_RATE_LIMIT, acceptanceController.recusar);
    server.get('/api/aceite/:token/pdf', acceptanceController.pdfPorToken);

    // COM SESSÃO — o painel.
    server.get('/api/acceptances', acceptanceController.listar);
    server.post('/api/acceptances/:id/remind', WRITE_RATE_LIMIT, acceptanceController.lembrar);
    server.get('/api/acceptances/:id/pdf', acceptanceController.pdf);

    logger.info('[Maestro] Rotas de Aceite inicializadas.');
  }
}
