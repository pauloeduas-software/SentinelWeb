import type { FastifyInstance } from 'fastify';
import { reconciliationController } from './controllers/reconciliation.controller';
import { createLogger } from '../../core/logger/logger';
import { DESTRUCTIVE_RATE_LIMIT, WRITE_RATE_LIMIT } from '../../core/http/write-rate-limit';

const logger = createLogger('reconciliation.maestro');

// A CONVERGÊNCIA RMM × ITAM — o domínio que liga os dois lados sem fundi-los.
//
// Domínio próprio, e não uma pasta dentro de `endpoint/` ou de `asset/`, porque
// ele não é de nenhum dos dois: ele é sobre a RELAÇÃO entre eles. Posto dentro
// de `endpoint`, o `asset` teria que importar do RMM para mostrar a aba Máquina;
// posto dentro de `asset`, o job de descoberta estaria no domínio que não fala
// com o agente. É a mesma razão de `assignment` não morar dentro de `asset`.
//
// As rotas de sugestão ficam em `/api/reconciliation/*` porque a fila é um
// recurso próprio — dá para abri-la, filtrá-la e resolvê-la sem saber de qual
// máquina ou ativo ela fala. As de vínculo penduram em `/api/endpoints/:id`,
// onde o recurso já existe.
export class ReconciliationMaestro {
  static async setupRoutes(server: FastifyInstance): Promise<void> {
    server.get('/api/reconciliation/suggestions', reconciliationController.listSuggestions);
    server.get('/api/reconciliation/coverage', reconciliationController.coverage);

    // OCIOSOS. Rota da reconciliação e não do ativo porque a resposta depende
    // dos dois lados: o uso vem da telemetria, o `postoVago` vem da posse.
    server.get('/api/reconciliation/idle', reconciliationController.idle);

    // ACEITAR afirma que esta máquina é aquele patrimônio, e o vínculo é
    // `@unique`: errar aqui exige o `DELETE` para corrigir. Teto de destrutiva.
    server.post(
      '/api/reconciliation/suggestions/:id/accept',
      DESTRUCTIVE_RATE_LIMIT,
      reconciliationController.accept,
    );

    // RECUSAR só carimba uma linha — mas carimba a MEMÓRIA da recusa (D97), e
    // quem recusa em rajada some com a fila. Teto de escrita comum.
    server.post(
      '/api/reconciliation/suggestions/:id/reject',
      WRITE_RATE_LIMIT,
      reconciliationController.reject,
    );

    // O VÍNCULO, no recurso que já existe. `POST` cria o vínculo (201) e
    // `DELETE` o desfaz — e o DELETE não apaga máquina nenhuma, só a afirmação
    // de que ela é aquele ativo.
    server.post('/api/endpoints/:id/link', DESTRUCTIVE_RATE_LIMIT, reconciliationController.link);
    server.delete('/api/endpoints/:id/link', DESTRUCTIVE_RATE_LIMIT, reconciliationController.unlink);

    // VINCULAR E ENTREGAR AO POSTO numa operação — o cadastro do computador
    // novo de ponta a ponta, a partir de `/descobertas`. Rota própria e não um
    // campo a mais no `link`: o corpo do vínculo é UMA afirmação (esta máquina
    // é aquele ativo), e a entrega é outra operação, com outra guarda e outro
    // histórico. Teto de destrutiva pelo mesmo motivo do `link`.
    server.post(
      '/api/endpoints/:id/link-and-checkout',
      DESTRUCTIVE_RATE_LIMIT,
      reconciliationController.linkAndCheckout,
    );

    server.patch('/api/endpoints/:id/review', WRITE_RATE_LIMIT, reconciliationController.review);

    // A ABA MÁQUINA. Pendura em `/api/assets/:id` como as rotas de ocupação
    // fazem com `/api/locations`: a pergunta "o que é esta máquina" é do ativo,
    // mas a resposta só existe porque os dois lados se falam.
    //
    // `/machine` e não o nome de um dos conteúdos: ela devolve especificação
    // coletada, os dois últimos contatos e a mudança de hardware detectada.
    server.get('/api/assets/:id/machine', reconciliationController.assetMachine);

    logger.info('[Maestro] Rotas de Reconciliação (RMM × ITAM) inicializadas.');
  }
}
