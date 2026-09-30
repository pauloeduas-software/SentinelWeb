import { z } from 'zod';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { idParamSchema } from '../../shared/params.schema';
import {
  listAlerts, marcarAlertaComoLido, marcarTodosComoLidos,
} from '../use-cases/list-alerts.usecase';
import { rodarAlertasDiarios } from '../use-cases/run-daily-alerts.usecase';

// `strictObject` na query: `?naoLido=1` (nome errado) passaria despercebido
// devolvendo tudo, que é o mesmo tipo de falha muda que o parser de listagem
// existe para evitar.
const listaQuerySchema = z.strictObject({
  apenasNaoLidos: z.enum(['true', 'false'], 'apenasNaoLidos: use true ou false').optional(),
});

export const alertController = {
  async list(request: FastifyRequest) {
    const { apenasNaoLidos } = listaQuerySchema.parse(request.query ?? {});
    return listAlerts(apenasNaoLidos === 'true');
  },

  async read(request: FastifyRequest) {
    const { id } = idParamSchema.parse(request.params);
    return marcarAlertaComoLido(id);
  },

  async readAll(_request: FastifyRequest, reply: FastifyReply) {
    const lidos = await marcarTodosComoLidos();
    return reply.status(200).send({ lidos });
  },

  /**
   * O GATILHO MANUAL da rodada — e ele existe para ser usado de verdade.
   *
   * Sem ele, a única forma de ver o alerta funcionar é esperar a janela do dia
   * seguinte, o que faz qualquer ajuste de limiar custar 24 h. A idempotência vem
   * do `dedupeKey`, não da rota: chamar dez vezes cria os mesmos alertas uma vez.
   *
   * Ele NÃO toma a janela em `job_runs`: é a rodada de quem está olhando a tela, e
   * consumir a janela do dia faria um teste manual às 9h cancelar o disparo
   * automático das 9h30.
   */
  async run(_request: FastifyRequest, reply: FastifyReply) {
    const resultado = await rodarAlertasDiarios();
    return reply.status(200).send(resultado);
  },
};
