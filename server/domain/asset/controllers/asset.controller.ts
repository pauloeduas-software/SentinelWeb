import type { FastifyReply, FastifyRequest } from 'fastify';
import { parseListQuery } from '../../../core/http/list-query';
import { hwidParamSchema, sendCommandSchema } from '../schemas/asset.schema';
import { ASSET_SORTABLE } from '../helpers/asset-filters.helper';
import { listAssets } from '../use-cases/list-assets.usecase';
import { sendCommand } from '../use-cases/send-command.usecase';

// Só HTTP: lê a requisição, chama o use-case, devolve a resposta. Sem
// try/catch — no Fastify o handler async que rejeita cai no errorHandler
// registrado em core/errors/error-handler.ts.
export const assetController = {
  async list(request: FastifyRequest) {
    // `perPage` generoso: a tela de telemetria mostra a frota inteira em cards e
    // não tem controle de página. O envelope existe para a API ter uma forma só
    // de resposta — quando a frota crescer, o controle entra sem mudar contrato.
    const query = parseListQuery(request.query, {
      sortable: ASSET_SORTABLE,
      defaultSort: 'hostname',
      defaultOrder: 'asc',
      perPage: 500,
      maxPerPage: 1_000,
    });
    return listAssets(query);
  },

  async command(request: FastifyRequest, reply: FastifyReply) {
    const { hwid } = hwidParamSchema.parse(request.params);
    const { action } = sendCommandSchema.parse(request.body ?? {});

    const { commandId } = await sendCommand(hwid, action);
    return reply.status(200).send({ message: 'Comando enviado.', commandId });
  },
};
