import type { FastifyReply, FastifyRequest } from 'fastify';
import { idParamSchema } from '../../shared/params.schema';
import { atorDaRequisicao } from '../../auth/helpers/actor.helper';
import {
  addOccupantSchema, occupancyViewQuerySchema, occupantParamsSchema,
} from '../schemas/occupancy.schema';
import { listLocationOccupants } from '../use-cases/list-location-occupants.usecase';
import { addLocationOccupant } from '../use-cases/add-location-occupant.usecase';
import { endLocationOccupancy } from '../use-cases/end-location-occupancy.usecase';
import { listUserOccupancies } from '../use-cases/list-user-occupancies.usecase';

// Só HTTP. Sem try/catch: o `parse` do schema rejeita e a rejeição cai no
// errorHandler, que devolve 422 com o campo que falhou — e o `AppError` dos
// use-cases (404 / 409) sai por lá também, com a mensagem que eles escreveram.
export const occupancyController = {
  async listByLocation(request: FastifyRequest) {
    const { id } = idParamSchema.parse(request.params);
    const { view } = occupancyViewQuerySchema.parse(request.query ?? {});
    return listLocationOccupants(id, view);
  },

  async add(request: FastifyRequest, reply: FastifyReply) {
    const { id } = idParamSchema.parse(request.params);
    const data = addOccupantSchema.parse(request.body ?? {});
    const ocupacao = await addLocationOccupant(id, data, atorDaRequisicao(request));
    return reply.status(201).send(ocupacao);
  },

  // DELETE que não apaga: encerra a ocupação (`endedAt`). O porquê está no
  // use-case — histórico de posto é append-only.
  async end(request: FastifyRequest) {
    const { id, occupantId } = occupantParamsSchema.parse(request.params);
    return endLocationOccupancy(id, occupantId, atorDaRequisicao(request));
  },

  async listByUser(request: FastifyRequest) {
    const { id } = idParamSchema.parse(request.params);
    const { view } = occupancyViewQuerySchema.parse(request.query ?? {});
    return listUserOccupancies(id, view);
  },
};
