import type { FastifyInstance } from 'fastify';
import { workstationController } from './controllers/workstation.controller';
import { createLogger } from '../../core/logger/logger';

const logger = createLogger('workstation.maestro');

// O POSTO DE TRABALHO visto de frente — a Mesa 1, a bancada, o guichê.
//
// O modelo não muda: o posto É uma `Location` (D15), e nenhuma tabela nasce
// aqui. O que nasce é a SUPERFÍCIE. Antes, montar a Mesa 1 com Laura de manhã e
// Ana à tarde exigia Configurações → 6ª aba → achar a linha → um ícone pequeno;
// o coração do modelo de posse estava atrás de uma tela de configuração.
//
// SÓ LEITURA, e isso é decisão. Criar, renomear e apagar um posto é criar,
// renomear e apagar uma `Location`, e isso já tem dono: o CRUD de catálogo
// (`POST /api/locations` com `isWorkstation: true`). Um segundo caminho de
// escrita para a mesma tabela seria um segundo lugar para esquecer a guarda de
// ciclo, o 409 por uso e o `ActivityLog` — a divergência silenciosa que o
// MODELO-POSSE.md existe para impedir, um andar abaixo.
//
// Os OCUPANTES também não estão aqui: são do domínio `occupancy`, que já expõe
// `/api/locations/:id/occupants`. A tela de postos consome as três rotas; o
// servidor continua com um dono por conceito.
export class WorkstationMaestro {
  static async setupRoutes(server: FastifyInstance): Promise<void> {
    server.get('/api/workstations', workstationController.list);
    server.get('/api/workstations/:id', workstationController.detail);

    logger.info('[Maestro] Rotas de Postos de trabalho inicializadas.');
  }
}
