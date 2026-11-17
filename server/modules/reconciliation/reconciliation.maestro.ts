import type { FastifyInstance } from 'fastify';
import { reconciliationController } from './controllers/reconciliation.controller';
import { createLogger } from '../../infra/logger/logger';
import { DESTRUCTIVE_RATE_LIMIT } from '../../infra/http/write-rate-limit';

const logger = createLogger('reconciliation.maestro');

// A CONVERGÊNCIA RMM × ITAM — o domínio que liga os dois lados sem fundi-los.
//
// Domínio próprio, e não uma pasta dentro de `endpoint/` ou de `asset/`, porque
// ele não é de nenhum dos dois: ele é sobre a RELAÇÃO entre eles. Posto dentro
// de `endpoint`, o `asset` teria que importar do RMM para mostrar a aba Máquina;
// posto dentro de `asset`, o vínculo automático estaria no domínio que não fala
// com o agente. É a mesma razão de `assignment` não morar dentro de `asset`.
//
// As rotas de vínculo penduram em `/api/endpoints/:id`, onde o recurso já existe;
// a cobertura é do domínio, e não de uma máquina.
export class ReconciliationMaestro {
  static async setupRoutes(server: FastifyInstance): Promise<void> {
    server.get('/api/reconciliation/coverage', reconciliationController.coverage);

    // O VÍNCULO, no recurso que já existe. `POST` cria o vínculo (201) e
    // `DELETE` o desfaz — e o DELETE não apaga máquina nenhuma, só a afirmação
    // de que ela é aquele ativo.
    server.post('/api/endpoints/:id/link', DESTRUCTIVE_RATE_LIMIT, reconciliationController.link);
    server.delete('/api/endpoints/:id/link', DESTRUCTIVE_RATE_LIMIT, reconciliationController.unlink);

    // VINCULAR E ENTREGAR AO POSTO numa operação — o cadastro do computador
    // novo de ponta a ponta, a partir de `/agentes`. Rota própria e não um
    // campo a mais no `link`: o corpo do vínculo é UMA afirmação (esta máquina
    // é aquele ativo), e a entrega é outra operação, com outra guarda e outro
    // histórico. Teto de destrutiva pelo mesmo motivo do `link`.
    server.post(
      '/api/endpoints/:id/link-and-checkout',
      DESTRUCTIVE_RATE_LIMIT,
      reconciliationController.linkAndCheckout,
    );

    // A ABA MÁQUINA. Pendura em `/api/assets/:id` como as rotas de ocupação
    // fazem com `/api/locations`: a pergunta "o que é esta máquina" é do ativo,
    // mas a resposta só existe porque os dois lados se falam.
    //
    // `/machine` e não o nome de um dos conteúdos: ela devolve qual máquina está
    // vinculada, e a aba lê o resto em `GET /api/endpoints/:id` (BY).
    server.get('/api/assets/:id/machine', reconciliationController.assetMachine);

    logger.debug('[Maestro] Rotas de Reconciliação (RMM × ITAM) inicializadas.');
  }
}
