import type { FastifyInstance } from 'fastify';
import { createLogger } from '../../core/logger/logger';
import { DESTRUCTIVE_RATE_LIMIT, EXPORT_RATE_LIMIT, WRITE_RATE_LIMIT } from '../../core/http/write-rate-limit';
import { importController } from './controllers/import.controller';

const logger = createLogger('import.maestro');

// A IMPORTAÇÃO DE CSV (docs/historico/fase-10-etiquetas-relatorios-importacao.md, Etapa D).
//
// DOIS PASSOS, DUAS ROTAS, e a separação é a regra (D68): `POST /api/imports`
// simula e grava o relatório; `POST /api/imports/:id/apply` executa. Não existe
// rota que faça as duas coisas — import é a operação com maior razão
// dano/esforço do sistema, e ver antes é a única chance de perceber que a
// coluna *Local* veio trocada.
export class ImportMaestro {
  static async setupRoutes(server: FastifyInstance): Promise<void> {
    // O que a tela precisa para montar o mapeamento, e o arquivo-modelo. Os
    // dois são leitura pura e não dependem de importação nenhuma existir.
    server.get('/api/imports/fields', importController.campos);
    server.get('/api/imports/template', EXPORT_RATE_LIMIT, importController.modelo);

    server.get('/api/imports', importController.listar);
    server.get('/api/imports/:id', importController.porId);
    server.get('/api/imports/:id/rows', importController.linhas);

    // O UPLOAD tem teto de ESCRITA (40/min): ele parseia e simula um arquivo de
    // até 20 mil linhas, e cada simulação consulta o banco.
    server.post('/api/imports', WRITE_RATE_LIMIT, importController.criar);

    // O APPLY tem o teto DESTRUTIVO (10/min), e é a rota mais perigosa do
    // sistema: ela cria, atualiza e abre posse em massa. O teto não é contra
    // abuso — é contra o clique duplo de quem está ansioso, somado ao
    // `APLICANDO` que a segunda chamada encontra.
    server.post('/api/imports/:id/apply', DESTRUCTIVE_RATE_LIMIT, importController.aplicar);

    logger.info('[Maestro] Rotas de Importação inicializadas.');
  }
}
