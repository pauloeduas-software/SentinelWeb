import type { FastifyReply, FastifyRequest } from 'fastify';
import { atorDaRequisicao } from '../../auth/helpers/actor.helper';
import { idParamSchema } from '../../shared/params.schema';
import { consumableSpec } from '../helpers/stock-kind.helper';
import {
  consumeSchema, createConsumableSchema, updateConsumableSchema,
} from '../schemas/consumable.schema';
import { consumeConsumable } from '../use-cases/consume-consumable.usecase';
import { crudController } from './stock-crud.controller';

// Note o que este controller NÃO tem: um `checkin`. Não há coluna, não há rota
// e não há schema (D37) — `POST /api/consumables/checkouts/:id/checkin`
// responde 404 do roteador, e implementar a devolução exige uma migração.
export const consumableController = {
  ...crudController(consumableSpec, { create: createConsumableSchema, update: updateConsumableSchema }),

  async consume(request: FastifyRequest, reply: FastifyReply) {
    const { id } = idParamSchema.parse(request.params);
    const data = consumeSchema.parse(request.body ?? {});
    return reply.status(201).send(await consumeConsumable(id, data, atorDaRequisicao(request)));
  },
};
