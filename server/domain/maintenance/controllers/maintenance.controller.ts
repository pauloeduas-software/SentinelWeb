import type { FastifyReply, FastifyRequest } from 'fastify';
import { parseListQuery } from '../../../core/http/list-query';
import { atorDaRequisicao } from '../../auth/helpers/actor.helper';
import { idParamSchema } from '../../shared/params.schema';
import { MAINTENANCE_SORTABLE } from '../helpers/maintenance-select.helper';
import { separarFiltrosDeManutencao } from '../helpers/maintenance-filters.helper';
import {
  closeMaintenanceSchema, createMaintenanceSchema, updateMaintenanceSchema,
} from '../schemas/maintenance.schema';
import { listMaintenances } from '../use-cases/list-maintenances.usecase';
import { listAssetMaintenances } from '../use-cases/list-asset-maintenances.usecase';
import { createMaintenance } from '../use-cases/create-maintenance.usecase';
import { updateMaintenance } from '../use-cases/update-maintenance.usecase';
import { closeMaintenance } from '../use-cases/close-maintenance.usecase';
import { deleteMaintenance } from '../use-cases/delete-maintenance.usecase';

// Só HTTP: lê a requisição, chama o use-case, responde. Sem try/catch — handler
// async que rejeita cai sozinho no `errorHandler`.

export const maintenanceController = {
  async list(request: FastifyRequest) {
    // Os filtros do domínio saem PRIMEIRO: o parser do `core` valida com
    // `strictObject` e responderia 422 a `?situacao=abertas`, que ele por decisão
    // de camada não conhece (D20).
    const { filtros, paraOCore } = separarFiltrosDeManutencao(request.query);

    const query = parseListQuery(paraOCore, {
      sortable: MAINTENANCE_SORTABLE,
      defaultSort: 'startDate',
      defaultOrder: 'desc',
      // Sem lixeira: a tabela não tem `deletedAt` (histórico é append-only), e
      // aceitar `?view=trashed` seria oferecer uma vista que não existe.
      trashable: false,
    });

    return listMaintenances(query, filtros);
  },

  /** A aba Manutenções da tela do ativo. O `:id` é o do ATIVO. */
  async doAtivo(request: FastifyRequest) {
    const { id } = idParamSchema.parse(request.params);
    return listAssetMaintenances(id);
  },

  /** 201 e o `:id` é o do ATIVO: manutenção nasce sempre pendurada num. */
  async create(request: FastifyRequest, reply: FastifyReply) {
    const { id } = idParamSchema.parse(request.params);
    const data = createMaintenanceSchema.parse(request.body ?? {});
    const manutencao = await createMaintenance(id, data, atorDaRequisicao(request));
    return reply.status(201).send(manutencao);
  },

  async update(request: FastifyRequest) {
    const { id } = idParamSchema.parse(request.params);
    const data = updateMaintenanceSchema.parse(request.body ?? {});
    return updateMaintenance(id, data, atorDaRequisicao(request));
  },

  /** 200, e não 201: o encerramento FECHA a linha que já existia. */
  async close(request: FastifyRequest) {
    const { id } = idParamSchema.parse(request.params);
    const data = closeMaintenanceSchema.parse(request.body ?? {});
    return closeMaintenance(id, data, atorDaRequisicao(request));
  },

  async remove(request: FastifyRequest, reply: FastifyReply) {
    const { id } = idParamSchema.parse(request.params);
    await deleteMaintenance(id, atorDaRequisicao(request));
    return reply.status(204).send();
  },
};
