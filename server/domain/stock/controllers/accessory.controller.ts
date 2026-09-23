import type { FastifyReply, FastifyRequest } from 'fastify';
import { atorDaRequisicao } from '../../auth/helpers/actor.helper';
import { idParamSchema } from '../../shared/params.schema';
import { accessorySpec } from '../helpers/stock-kind.helper';
import {
  checkinAccessorySchema, checkoutAccessorySchema,
  createAccessorySchema, updateAccessorySchema,
} from '../schemas/accessory.schema';
import { checkoutAccessory } from '../use-cases/checkout-accessory.usecase';
import { checkinAccessory } from '../use-cases/checkin-accessory.usecase';
import { listAccessoryCheckouts } from '../use-cases/list-accessory-checkouts.usecase';
import { crudController } from './stock-crud.controller';

export const accessoryController = {
  ...crudController(accessorySpec, { create: createAccessorySchema, update: updateAccessorySchema }),

  async checkout(request: FastifyRequest, reply: FastifyReply) {
    const { id } = idParamSchema.parse(request.params);
    const data = checkoutAccessorySchema.parse(request.body ?? {});
    // 201: a entrega CRIA uma linha em `accessory_checkouts` — uma por unidade.
    // O ator vem da SESSÃO, nunca do corpo.
    const checkout = await checkoutAccessory(id, data, atorDaRequisicao(request));
    return reply.status(201).send(checkout);
  },

  /** 200, e não 201: a devolução FECHA a saída que já existia. */
  async checkin(request: FastifyRequest) {
    const { id } = idParamSchema.parse(request.params);
    const data = checkinAccessorySchema.parse(request.body ?? {});
    return checkinAccessory(id, data, atorDaRequisicao(request));
  },

  /** As unidades deste acessório que estão fora — quem tem o quê. */
  async checkouts(request: FastifyRequest) {
    const { id } = idParamSchema.parse(request.params);
    return listAccessoryCheckouts(id);
  },
};
