import type { FastifyReply, FastifyRequest } from 'fastify';
import { idParamSchema } from '../../shared/params.schema';
import { atorDaRequisicao } from '../../auth/helpers/actor.helper';
import { bulkCheckoutSchema, checkinSchema, checkoutSchema } from '../schemas/assignment.schema';
import { checkoutAsset } from '../use-cases/checkout-asset.usecase';
import { bulkCheckout } from '../use-cases/bulk-checkout.usecase';
import { checkinAsset } from '../use-cases/checkin-asset.usecase';
import { listAssetAssignments } from '../use-cases/list-asset-assignments.usecase';
import { listOverdueAssignments } from '../use-cases/list-overdue.usecase';
import { listUserHoldings } from '../use-cases/list-user-holdings.usecase';

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

  /**
   * 200, e NÃO 201: a entrega em massa não cria "um" recurso — ela devolve um
   * RELATÓRIO de N entregas independentes, em que parte pode ter sido recusada
   * (D31). Um 201 com `Location` apontando para quê? E um 207 Multi-Status
   * obrigaria todo cliente a saber ler um formato que só esta rota usa: o
   * relatório no corpo diz a mesma coisa em português.
   *
   * O status também não vira 4xx quando TODAS falham: o pedido foi processado,
   * e o que o operador precisa ver é a lista de motivos — que um 409 genérico
   * esconderia atrás de uma frase só.
   */
  async bulkCheckout(request: FastifyRequest) {
    const data = bulkCheckoutSchema.parse(request.body ?? {});
    return bulkCheckout(data, atorDaRequisicao(request));
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

  async holdings(request: FastifyRequest) {
    const { id } = idParamSchema.parse(request.params);
    return listUserHoldings(id);
  },

  // Sem query string nenhuma, e é de propósito: o recorte é a definição de
  // vencido (`docs/FASE-4-PLANO-ITAM.md`, Etapa D), não uma preferência de quem
  // consulta. Filtro por pessoa ou por local entraria quando existir a tela que
  // o peça — e aí como parâmetro validado, nunca como `where` vindo do cliente.
  async overdue() {
    return listOverdueAssignments();
  },
};
