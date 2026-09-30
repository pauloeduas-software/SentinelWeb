import type { FastifyReply, FastifyRequest } from 'fastify';
import { atorDaRequisicao } from '../../auth/helpers/actor.helper';
import { idParamSchema } from '../../shared/params.schema';
import { historyQuerySchema } from '../../shared/history.schema';
import { auditLocationSchema, recordAuditSchema } from '../schemas/audit.schema';
import { recordAudit } from '../use-cases/record-audit.usecase';
import { listAssetAudits } from '../use-cases/list-audits.usecase';
import { auditarPosto, lerConferenciaDoPosto } from '../use-cases/audit-location.usecase';

// Só HTTP. Sem try/catch: o `parse` rejeita e o errorHandler devolve 422 com o
// campo que falhou; os `AppError` dos use-cases (404 de ativo, 422 de resultado
// incoerente) saem pelo mesmo caminho.

export const auditController = {
  /** 201: a conferência CRIA uma linha de histórico. O `:id` é o do ATIVO. */
  async record(request: FastifyRequest, reply: FastifyReply) {
    const { id } = idParamSchema.parse(request.params);
    const data = recordAuditSchema.parse(request.body ?? {});
    const auditoria = await recordAudit(id, data, atorDaRequisicao(request));
    return reply.status(201).send(auditoria);
  },

  async doAtivo(request: FastifyRequest) {
    const { id } = idParamSchema.parse(request.params);
    const { limit } = historyQuerySchema.parse(request.query ?? {});
    return listAssetAudits(id, limit);
  },

  /** As DUAS listas do posto — e a diferença entre elas é a divergência. */
  async conferenciaDoPosto(request: FastifyRequest) {
    const { id } = idParamSchema.parse(request.params);
    return lerConferenciaDoPosto(id);
  },

  /** 201: N ativos conferidos, N linhas de `Audit`, uma transação (D54). */
  async auditarPosto(request: FastifyRequest, reply: FastifyReply) {
    const { id } = idParamSchema.parse(request.params);
    const data = auditLocationSchema.parse(request.body ?? {});
    const resultado = await auditarPosto(id, data, atorDaRequisicao(request));
    return reply.status(201).send(resultado);
  },
};
