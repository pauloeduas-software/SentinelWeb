import type { FastifyInstance } from 'fastify';
import { workstationController } from './controllers/workstation.controller';
import { workstationSpec } from './specs/workstation.spec';
import { createCatalogController } from '../catalog/controllers/catalog.controller';
import { createLogger } from '../../core/logger/logger';
import { WRITE_RATE_LIMIT } from '../../core/http/write-rate-limit';

const logger = createLogger('workstation.maestro');

// O POSTO DE TRABALHO — a MesaEscritório, a bancada, o guichê (decisão Y).
//
// DUAS metades, e cada uma com o seu dono:
//
//   o CADASTRO   criar, renomear, mudar de localização, desativar e excluir.
//                É o MESMO controller das tabelas de catálogo, amarrado à
//                `workstationSpec`: nome único, 409 pelo que está nele agora e
//                `ActivityLog` vêm do CRUD genérico, e não de uma cópia que
//                divergiria na primeira correção. Não há `POST /:id/restore`:
//                o posto não tem lixeira, como o status.
//
//   a TELA       a listagem com quem está em cada mesa e quantos ativos ela
//                tem, e a ficha de um posto — leituras próprias, porque juntam
//                posse, ocupação e estoque, e nenhuma spec expressa isso.
//
// Os OCUPANTES não estão aqui: são do domínio `occupancy`, que pendura
// `/api/workstations/:id/occupants`.
export class WorkstationMaestro {
  static async setupRoutes(server: FastifyInstance): Promise<void> {
    const cadastro = createCatalogController(workstationSpec);

    server.get('/api/workstations', workstationController.list);
    server.get('/api/workstations/options', cadastro.options);
    server.get('/api/workstations/:id', workstationController.detail);
    server.post('/api/workstations', WRITE_RATE_LIMIT, cadastro.create);
    server.put('/api/workstations/:id', WRITE_RATE_LIMIT, cadastro.update);
    server.delete('/api/workstations/:id', WRITE_RATE_LIMIT, cadastro.remove);

    logger.info('[Maestro] Rotas de Postos de trabalho inicializadas.');
  }
}
