import type { FastifyReply, FastifyRequest } from 'fastify';
import { atorDaRequisicao } from '../../auth/helpers/actor.helper';
import { idParamSchema } from '../../shared/params.schema';
import { componentSpec } from '../helpers/stock-kind.helper';
import {
  attachComponentSchema, createComponentSchema,
  detachComponentSchema, updateComponentSchema,
} from '../schemas/component.schema';
import { attachComponent } from '../use-cases/attach-component.usecase';
import { detachComponent } from '../use-cases/detach-component.usecase';
import { listAssetComponents } from '../use-cases/list-asset-components.usecase';
import { crudController } from './stock-crud.controller';

export const componentController = {
  ...crudController(componentSpec, { create: createComponentSchema, update: updateComponentSchema }),

  async attach(request: FastifyRequest, reply: FastifyReply) {
    const { id } = idParamSchema.parse(request.params);
    const data = attachComponentSchema.parse(request.body ?? {});
    return reply.status(201).send(await attachComponent(id, data, atorDaRequisicao(request)));
  },

  /**
   * 200: a retirada FECHA a instalação. O corpo devolve a linha fechada E a
   * sucessora (`null` na retirada total) — as duas, porque a divisão do D38 é
   * justamente o que a tela precisa mostrar para rotular "parcial: 2 de 4".
   */
  async detach(request: FastifyRequest) {
    const { id } = idParamSchema.parse(request.params);
    const data = detachComponentSchema.parse(request.body ?? {});
    return detachComponent(id, data, atorDaRequisicao(request));
  },

  /** O que está dentro de UM ativo — a aba Componentes da tela do ativo. */
  async doAtivo(request: FastifyRequest) {
    const { id } = idParamSchema.parse(request.params);
    return listAssetComponents(id);
  },
};
