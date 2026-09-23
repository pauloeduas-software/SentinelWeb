import type { FastifyInstance } from 'fastify';
import { assignmentController } from './controllers/assignment.controller';
import { createLogger } from '../../core/logger/logger';
import { WRITE_RATE_LIMIT } from '../../core/http/write-rate-limit';

const logger = createLogger('assignment.maestro');

// A POSSE — entrega, devolução e quem responde pelo quê (docs/MODELO-POSSE.md).
//
// As rotas penduram em `/api/assets` e `/api/users`, mas o domínio é próprio, e
// não uma pasta a mais dentro de `asset/`: a entrega não é uma edição de ativo,
// é a operação que escreve `Asset.assignedToId` — a única, junto com a
// devolução. Mantê-la aqui é o que deixa o CRUD do ativo continuar sem saber o
// que é uma posse.
//
// Todas as rotas de `/api/assets` usam `:id` como nome do parâmetro, inclusive
// as do `asset.maestro.ts`: o find-my-way recusa dois nomes diferentes na mesma
// posição do caminho, e a recusa acontece no boot, não na primeira requisição.
export class AssignmentMaestro {
  static async setupRoutes(server: FastifyInstance): Promise<void> {
    server.post('/api/assets/:id/checkout', WRITE_RATE_LIMIT, assignmentController.checkout);
    server.post('/api/assets/:id/checkin', WRITE_RATE_LIMIT, assignmentController.checkin);

    // ENTREGA EM MASSA — o kit de onboarding (D31). Rota ESTÁTICA irmã de
    // `/api/assets/:id/checkout`, e não `/api/assets/checkout` em lote: o
    // find-my-way prefere o segmento literal ao parâmetro, então
    // `bulk-checkout` nunca é confundido com um `:id`. O hífen no nome é o que
    // deixa isso legível em log e em `curl`.
    //
    // Teto de escrita como as outras: uma entrega em massa é UMA requisição, e
    // o que ela move são N linhas — o custo por requisição é maior, o número de
    // requisições humanas por minuto não.
    server.post('/api/assets/bulk-checkout', WRITE_RATE_LIMIT, assignmentController.bulkCheckout);

    // Posses abertas com prazo vencido. Mora em `/api/assignments`, e não em
    // `/api/assets/overdue`, porque o que está vencido é a POSSE — o ativo não
    // tem prazo nenhum, quem tem é a entrega. É também a primeira rota do
    // sistema a pendurar no nome do domínio, e a do lembrete automático (F8)
    // entra ao lado desta.
    server.get('/api/assignments/overdue', assignmentController.overdue);

    // Histórico do ativo, mais recente primeiro. Append-only: a devolução
    // preenche `checkinAt` e a linha fica, então esta rota mostra a posse atual
    // e todas as anteriores.
    server.get('/api/assets/:id/assignments', assignmentController.history);

    // O que a pessoa responde: as posses diretas dela MAIS os ativos dos postos
    // que ela ocupa. A soma das duas é a Camada 3 vista do lado do colaborador.
    server.get('/api/users/:id/holdings', assignmentController.holdings);

    logger.info('[Maestro] Rotas de Posse (entrega/devolução) inicializadas.');
  }
}
