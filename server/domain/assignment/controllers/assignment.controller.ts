import type { FastifyReply, FastifyRequest } from 'fastify';
import { idParamSchema } from '../../shared/params.schema';
import { atorDaRequisicao } from '../../auth/helpers/actor.helper';
import { checkinSchema, checkoutSchema } from '../schemas/assignment.schema';
import { checkoutAsset } from '../use-cases/checkout-asset.usecase';
import { checkinAsset } from '../use-cases/checkin-asset.usecase';
import { listAssetAssignments } from '../use-cases/list-asset-assignments.usecase';

// Só HTTP. Sem try/catch: o `parse` do schema rejeita e a rejeição cai no
// errorHandler, que devolve 422 com o campo que falhou — e os `AppError` dos
// use-cases (409 de ativo já entregue, 422 de alvo incoerente) saem pelo mesmo
// caminho, sem ninguém montar resposta de erro na mão.
export const assignmentController = {
  async checkout(request: FastifyRequest, reply: FastifyReply) {
    const { id } = idParamSchema.parse(request.params);
    const data = checkoutSchema.parse(request.body ?? {});
    // 201: a entrega CRIA uma linha em `assignments`. O corpo devolve a posse e
    // o ativo já atualizado, porque a tela precisa dos dois — o status e o
    // responsável mudaram na mesma operação.
    // O ator vem da SESSÃO, nunca do corpo: é ele que assina o termo de
    // entrega em `Assignment.checkoutById` (D25).
    const resultado = await checkoutAsset(id, data, atorDaRequisicao(request));
    return reply.status(201).send(resultado);
  },

  async checkin(request: FastifyRequest) {
    const { id } = idParamSchema.parse(request.params);
    const data = checkinSchema.parse(request.body ?? {});
    // 200, e não 201: a devolução FECHA a posse que já existia.
    return checkinAsset(id, data, atorDaRequisicao(request));
  },

  async history(request: FastifyRequest) {
    const { id } = idParamSchema.parse(request.params);
    return listAssetAssignments(id);
  },

  // Sem query string nenhuma, e é de propósito: o recorte é a definição de
  // vencido (`docs/historico/fase-04-posse.md`, Etapa D), não uma preferência de quem
  // consulta. Filtro por pessoa ou por local entraria quando existir a tela que
  // o peça — e aí como parâmetro validado, nunca como `where` vindo do cliente.
};
