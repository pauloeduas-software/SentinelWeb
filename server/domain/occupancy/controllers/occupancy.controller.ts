import type { FastifyReply, FastifyRequest } from 'fastify';
import { idParamSchema } from '../../shared/params.schema';
import { SEM_PARAMETROS } from '../../../core/http/sem-parametros';
import {
  addOccupantSchema, occupancyViewQuerySchema, occupantParamsSchema,
  updateOccupantShiftSchema,
} from '../schemas/occupancy.schema';
import { listWorkstationOccupants } from '../use-cases/list-workstation-occupants.usecase';
import { addWorkstationOccupant } from '../use-cases/add-workstation-occupant.usecase';
import { endWorkstationOccupancy } from '../use-cases/end-workstation-occupancy.usecase';
import { updateOccupantShift } from '../use-cases/update-occupant-shift.usecase';
import { listPersonOccupancies } from '../use-cases/list-person-occupancies.usecase';

// Só HTTP. Sem try/catch: o `parse` do schema rejeita e a rejeição cai no
// errorHandler, que devolve 422 com o campo que falhou — e o `AppError` dos
// use-cases (404 / 409) sai por lá também, com a mensagem que eles escreveram.
export const occupancyController = {
  async listByWorkstation(request: FastifyRequest) {
    const { id } = idParamSchema.parse(request.params);
    const { view } = occupancyViewQuerySchema.parse(request.query ?? {});
    return listWorkstationOccupants(id, view);
  },

  async add(request: FastifyRequest, reply: FastifyReply) {
    const { id } = idParamSchema.parse(request.params);
    const data = addOccupantSchema.parse(request.body ?? {});
    const ocupacao = await addWorkstationOccupant(id, data);
    return reply.status(201).send(ocupacao);
  },

  // DELETE que não apaga: encerra a ocupação (`endedAt`). O porquê está no
  // use-case — histórico de posto é append-only.
  async end(request: FastifyRequest) {
    const { id, occupantId } = occupantParamsSchema.parse(request.params);
    return endWorkstationOccupancy(id, occupantId);
  },

  // PATCH e não PUT: corrige UM atributo do vínculo aberto, e o resto da
  // ocupação (pessoa, posto, `startedAt`) não é alterável por desenho.
  async updateShift(request: FastifyRequest) {
    const { id, occupantId } = occupantParamsSchema.parse(request.params);
    const { shift } = updateOccupantShiftSchema.parse(request.body ?? {});
    return updateOccupantShift(id, occupantId, shift);
  },

  // Só as ocupações ABERTAS: é o que a ficha da pessoa mostra. O histórico
  // completo dela vem pelo `/api/people/:id/history`.
  async listByPerson(request: FastifyRequest) {
    const { id } = idParamSchema.parse(request.params);
    SEM_PARAMETROS.parse(request.query ?? {});
    return listPersonOccupancies(id, 'current');
  },
};
