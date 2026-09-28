import type { FastifyReply, FastifyRequest } from 'fastify';
import { idParamSchema } from '../../shared/params.schema';
import { atorDaRequisicao } from '../../auth/helpers/actor.helper';
import {
  aceiteSchema, buscaDePacotesSchema, filtroDeSugestoesSchema, fusaoSchema,
  janelaDeOciosidadeSchema, softwareDaLicencaSchema, triagemSchema, vinculoSchema,
} from '../schemas/reconciliation.schema';
import { listarSugestoes } from '../use-cases/list-suggestions.usecase';
import { aceitarSugestao } from '../use-cases/accept-suggestion.usecase';
import { recusarSugestao } from '../use-cases/reject-suggestion.usecase';
import { calcularCobertura } from '../use-cases/coverage-stats.usecase';
import { desvincularEndpoint, vincularEndpointAoAtivo } from '../use-cases/link-endpoint-asset.usecase';
import { triarEndpoint } from '../use-cases/review-endpoint.usecase';
import { fundirEndpoints } from '../use-cases/merge-endpoints.usecase';
import { listarAtivosOciosos } from '../use-cases/list-idle-assets.usecase';
import { calcularConformidade, definirSoftwareDaLicenca } from '../use-cases/license-compliance.usecase';
import { obterMaquinaDoAtivo } from '../use-cases/get-asset-machine.usecase';
import {
  listarPacotesDeSoftware, listarSoftwareDaLicenca,
} from '../use-cases/list-software-packages.usecase';

// Só HTTP. Sem try/catch: o `parse` rejeita e cai no errorHandler, que devolve
// 422 com o campo que falhou; o `AppError` dos use-cases sai por lá também.
export const reconciliationController = {
  async listSuggestions(request: FastifyRequest) {
    const filtro = filtroDeSugestoesSchema.parse(request.query ?? {});
    // Teto fixo e generoso: a fila é para ser esvaziada, não paginada. Se ela
    // passar de 200 itens o problema não é a paginação.
    return listarSugestoes({ ...filtro, perPage: 200 });
  },

  async accept(request: FastifyRequest) {
    const { id } = idParamSchema.parse(request.params);
    const extra = aceiteSchema.parse(request.body ?? {});
    return aceitarSugestao(id, atorDaRequisicao(request), extra);
  },

  async reject(request: FastifyRequest) {
    const { id } = idParamSchema.parse(request.params);
    return recusarSugestao(id, atorDaRequisicao(request));
  },

  async coverage(_request: FastifyRequest, reply: FastifyReply) {
    return reply.send(await calcularCobertura());
  },

  async link(request: FastifyRequest, reply: FastifyReply) {
    const { id } = idParamSchema.parse(request.params);
    const { assetId } = vinculoSchema.parse(request.body ?? {});
    const vinculado = await vincularEndpointAoAtivo(id, assetId, atorDaRequisicao(request));
    return reply.status(201).send(vinculado);
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

  async merge(request: FastifyRequest) {
    const { id } = idParamSchema.parse(request.params);
    const { intoEndpointId } = fusaoSchema.parse(request.body ?? {});
    return fundirEndpoints(id, intoEndpointId, atorDaRequisicao(request));
  },

  async assetMachine(request: FastifyRequest) {
    const { id } = idParamSchema.parse(request.params);
    return obterMaquinaDoAtivo(id);
  },

  async softwarePackages(request: FastifyRequest) {
    const { q, limite } = buscaDePacotesSchema.parse(request.query ?? {});
    return listarPacotesDeSoftware(q, limite);
  },

  async licenseCompliance(request: FastifyRequest) {
    const { id } = idParamSchema.parse(request.params);
    return calcularConformidade(id);
  },

  async licenseSoftware(request: FastifyRequest) {
    const { id } = idParamSchema.parse(request.params);
    const rows = await listarSoftwareDaLicenca(id);
    return { total: rows.length, rows };
  },

  async setLicenseSoftware(request: FastifyRequest) {
    const { id } = idParamSchema.parse(request.params);
    const { packageIds } = softwareDaLicencaSchema.parse(request.body ?? {});
    return definirSoftwareDaLicenca(id, packageIds, atorDaRequisicao(request));
  },

  async review(request: FastifyRequest) {
    const { id } = idParamSchema.parse(request.params);
    const { reviewState } = triagemSchema.parse(request.body ?? {});
    return triarEndpoint(id, reviewState, atorDaRequisicao(request));
  },
};
