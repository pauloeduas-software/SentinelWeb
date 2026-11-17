import type { FastifyReply, FastifyRequest } from 'fastify';
import { temCargo } from '../../access/helpers/require-permission';
import { atorDaRequisicao } from '../../auth/helpers/actor.helper';
import { idParamSchema } from '../../shared/params.schema';
import { vinculoComEntregaSchema, vinculoSchema } from '../schemas/reconciliation.schema';
import { calcularCobertura } from '../use-cases/coverage-stats.usecase';
import { desvincularEndpoint, vincularEndpointAoAtivo } from '../use-cases/link-endpoint-asset.usecase';
import { vincularEEntregar } from '../use-cases/link-and-checkout.usecase';
import { obterMaquinaDoAtivo } from '../use-cases/get-asset-machine.usecase';

// Só HTTP. Sem try/catch: o `parse` rejeita e cai no errorHandler, que devolve
// 422 com o campo que falhou; o `AppError` dos use-cases sai por lá também.
export const reconciliationController = {
  async coverage(_request: FastifyRequest, reply: FastifyReply) {
    return reply.send(await calcularCobertura());
  },

  async link(request: FastifyRequest, reply: FastifyReply) {
    const { id } = idParamSchema.parse(request.params);
    const { assetId } = vinculoSchema.parse(request.body ?? {});
    // O autor vem da SESSÃO, nunca do corpo (auth/helpers/actor.helper.ts).
    const vinculado = await vincularEndpointAoAtivo(id, assetId, atorDaRequisicao(request));
    return reply.status(201).send(vinculado);
  },

  async linkAndCheckout(request: FastifyRequest, reply: FastifyReply) {
    const { id } = idParamSchema.parse(request.params);
    const { assetId, targetWorkstationId } = vinculoComEntregaSchema.parse(request.body ?? {});
    // 201 como o vínculo e a entrega sozinhos: duas linhas nascem.
    const resultado = await vincularEEntregar(id, assetId, targetWorkstationId, atorDaRequisicao(request));
    return reply.status(201).send(resultado);
  },

  async unlink(request: FastifyRequest) {
    const { id } = idParamSchema.parse(request.params);
    return desvincularEndpoint(id, atorDaRequisicao(request));
  },

  async assetMachine(request: FastifyRequest) {
    const { id } = idParamSchema.parse(request.params);
    return obterMaquinaDoAtivo(id, temCargo(request, 'SUPERVISOR'));
  },
};
