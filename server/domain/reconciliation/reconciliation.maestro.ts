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

    // ACEITAR é a escrita mais pesada do sistema: ela pode abrir posse, mover
    // ativo entre camadas do modelo e criar ocupação. Teto de destrutiva.
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

    server.patch('/api/endpoints/:id/review', WRITE_RATE_LIMIT, reconciliationController.review);

    // A FUSÃO. `:id` é a máquina que DESAPARECE da listagem, e o corpo diz em
    // quem ela é absorvida — a URL descreve quem some, que é o que a operação
    // faz de irreversível.
    server.post('/api/endpoints/:id/merge', DESTRUCTIVE_RATE_LIMIT, reconciliationController.merge);

    // A ABA MÁQUINA. Pendura em `/api/assets/:id` como as rotas de ocupação
    // fazem com `/api/locations`: a pergunta "o que é esta máquina" é do ativo,
    // mas a resposta só existe porque os dois lados se falam.
    //
    // `/machine` e não `/software`, corrigindo o nome do plano: ela devolve
    // especificação, último contato, mudança de hardware detectada E a lista de
    // programas. Com quatro conteúdos, `software` nomeava um quarto da resposta.
    server.get('/api/assets/:id/machine', reconciliationController.assetMachine);

    // SOFTWARE E CONFORMIDADE (Etapa G).
    //
    // O CATÁLOGO DE PACOTES é o que faltava para a ponte do D102 ter porta de
    // entrada: sem ele, `PUT /api/licenses/:id/software` existia e nenhuma tela
    // tinha de onde tirar um `packageId`, então `LicenseSoftware` nunca recebia
    // linha e a conformidade respondia `semVinculoDeSoftware` para sempre.
    server.get('/api/software-packages', reconciliationController.softwarePackages);
    server.get('/api/licenses/:id/compliance', reconciliationController.licenseCompliance);
    server.get('/api/licenses/:id/software', reconciliationController.licenseSoftware);
    server.put('/api/licenses/:id/software', WRITE_RATE_LIMIT, reconciliationController.setLicenseSoftware);

    logger.info('[Maestro] Rotas de Reconciliação (RMM × ITAM) inicializadas.');
  }
}
