import type { FastifyInstance } from 'fastify';
import { customFieldController } from './controllers/custom-field.controller';
import { createLogger } from '../../core/logger/logger';
import { WRITE_RATE_LIMIT } from '../../core/http/write-rate-limit';

const logger = createLogger('custom-field.maestro');

// O QUE NÃO CABE NA SPEC DE CATÁLOGO (D64).
//
// ═════════════════════════════════════════════════════════════════════════════
// AS DEZ ROTAS PLANAS DOS DOIS CADASTROS NÃO ESTÃO AQUI.
//
// `GET/POST/PUT/DELETE /api/custom-fields` e `/api/custom-fieldsets` são
// registradas pelo `CatalogMaestro`, em laço sobre `CATALOG_SPECS`: acrescentar
// uma tabela de catálogo é escrever a spec, e as duas da F9 são spec.
//
// Aqui ficam as três rotas que a spec não sabe expressar, e todas pelo mesmo
// motivo — elas não gravam nem leem UM CAMPO de uma linha:
//
//   /custom-fields/list-view              → uma pergunta sobre o conjunto de
//                                           campos, não sobre um campo
//   /custom-fieldsets/:id/fields (GET)    → a composição, com o contador do D61
//   /custom-fieldsets/:id/fields (PUT)    → ordem e obrigatoriedade, que têm
//                                           regra, e regra mora em use-case
//
// As duas rotas de ATIVO da fase — `/api/assets/fieldset` e a de revelar —
// moram no `AssetMaestro`, porque são do espaço de URL do ativo. O use-case
// delas é daqui.
//
// E o mesmo vale sem rota nova: `op: 'custom-field'` do `POST /api/assets/bulk`
// é o backfill do D61, e a REGRA dele (formato, alcance do conjunto, cifra e
// obrigatório) mora em `use-cases/bulk-fill-field.usecase.ts`. Quem orquestra a
// transação é o lote do ativo; quem diz o que pode é este domínio.
// ═════════════════════════════════════════════════════════════════════════════
export class CustomFieldMaestro {
  static async setupRoutes(server: FastifyInstance): Promise<void> {
    // ANTES de qualquer rota paramétrica de `/api/custom-fields` — que o
    // `CatalogMaestro` já registrou. O find-my-way resolve por especificidade, e
    // `/list-view` é segmento estático, então não há ambiguidade: a nota está
    // aqui para quem acrescentar a próxima não precisar descobrir isso.
    server.get('/api/custom-fields/list-view', customFieldController.listView);

    server.get('/api/custom-fieldsets/:id/fields', customFieldController.fields);
    // PUT e não PATCH: a rota substitui a composição INTEIRA, que é o que a tela
    // de arrastar-e-soltar tem em mãos. Ver `set-fieldset-fields.usecase.ts`.
    server.put('/api/custom-fieldsets/:id/fields', WRITE_RATE_LIMIT, customFieldController.setFields);

    logger.info('[Maestro] Rotas de Campos Customizados inicializadas.');
  }
}
