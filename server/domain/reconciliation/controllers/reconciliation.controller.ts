import type { FastifyReply, FastifyRequest } from 'fastify';
import { SEM_PARAMETROS } from '../../../core/http/sem-parametros';
import { atorDaRequisicao } from '../../auth/helpers/actor.helper';
import { idParamSchema } from '../../shared/params.schema';
import {
  janelaDeOciosidadeSchema, triagemSchema, vinculoComEntregaSchema, vinculoSchema,
} from '../schemas/reconciliation.schema';
import { listarSugestoes } from '../use-cases/list-suggestions.usecase';
import { aceitarSugestao } from '../use-cases/accept-suggestion.usecase';
import { recusarSugestao } from '../use-cases/reject-suggestion.usecase';
import { calcularCobertura } from '../use-cases/coverage-stats.usecase';
import { desvincularEndpoint, vincularEndpointAoAtivo } from '../use-cases/link-endpoint-asset.usecase';
import { vincularEEntregar } from '../use-cases/link-and-checkout.usecase';
import { triarEndpoint } from '../use-cases/review-endpoint.usecase';
import { listarAtivosOciosos } from '../use-cases/list-idle-assets.usecase';
import { obterMaquinaDoAtivo } from '../use-cases/get-asset-machine.usecase';
import { reconciliarAgora } from '../use-cases/run-reconciliation.usecase';

// Só HTTP. Sem try/catch: o `parse` rejeita e cai no errorHandler, que devolve
// 422 com o campo que falhou; o `AppError` dos use-cases sai por lá também.
export const reconciliationController = {
  async listSuggestions(request: FastifyRequest) {
    SEM_PARAMETROS.parse(request.query ?? {});
    return listarSugestoes();
  },

  async accept(request: FastifyRequest) {
    const { id } = idParamSchema.parse(request.params);
    // O autor vem da SESSÃO, nunca do corpo (auth/helpers/actor.helper.ts).
    return aceitarSugestao(id, atorDaRequisicao(request));
  },

  async reject(request: FastifyRequest) {
    const { id } = idParamSchema.parse(request.params);
    return recusarSugestao(id, atorDaRequisicao(request));
  },

  async coverage(_request: FastifyRequest, reply: FastifyReply) {
    return reply.send(await calcularCobertura());
  },

  // A VARREDURA AGORA. Mesma função da rodada da hora, sem a janela: devolve o
  // placar da rodada, e o 409 de "já tem uma rodando" sai pelo errorHandler.
  async runNow(request: FastifyRequest) {
    return reconciliarAgora(atorDaRequisicao(request));
  },

  async link(request: FastifyRequest, reply: FastifyReply) {
    const { id } = idParamSchema.parse(request.params);
    const { assetId } = vinculoSchema.parse(request.body ?? {});
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

  async idle(request: FastifyRequest) {
    const { dias } = janelaDeOciosidadeSchema.parse(request.query ?? {});
    const rows = await listarAtivosOciosos(dias);
    return { total: rows.length, rows };
  },

  async assetMachine(request: FastifyRequest) {
    const { id } = idParamSchema.parse(request.params);
    return obterMaquinaDoAtivo(id);
  },

  async review(request: FastifyRequest) {
    const { id } = idParamSchema.parse(request.params);
    const { reviewState } = triagemSchema.parse(request.body ?? {});
    return triarEndpoint(id, reviewState, atorDaRequisicao(request));
  },
};
