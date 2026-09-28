import type { FastifyReply, FastifyRequest } from 'fastify';
import { parseListQuery } from '../../../core/http/list-query';
import { endpointFilterSchema, hwidParamSchema, sendCommandSchema } from '../schemas/endpoint.schema';
import { ENDPOINT_SORTABLE } from '../helpers/endpoint-filters.helper';
import { listEndpoints } from '../use-cases/list-endpoints.usecase';
import { sendCommand } from '../use-cases/send-command.usecase';

// Só HTTP: lê a requisição, chama o use-case, devolve a resposta. Sem
// try/catch — no Fastify o handler async que rejeita cai no errorHandler
// registrado em core/errors/error-handler.ts.
export const endpointController = {
  async list(request: FastifyRequest) {
    // A QUERY TEM DOIS DONOS, E POR ISSO É SEPARADA ANTES DE QUALQUER `parse`.
    //
    // `vinculo` e `reviewState` são do domínio; o resto (`page`, `perPage`,
    // `sort`, `order`, `q`) é do `parseListQuery` — que é `strictObject` e
    // RECUSA qualquer chave que não conheça. Entregar a query inteira aos dois
    // dava 422 em requisição válida: `?vinculo=sem` respondia
    // *campo não reconhecido: "vinculo"*, e os dois filtros que a F7 escreveu
    // ficavam inalcançáveis por HTTP — implementados no helper, tipados no
    // use-case e mortos na borda.
    //
    // É o mesmo trecho que `workstation.controller.ts` já tinha, com a mesma
    // nota explicando o motivo. Ele foi escrito porque o problema tinha
    // acontecido lá; aqui a F7 refez o erro em vez de copiar a solução.
    const { vinculo, reviewState, ...paginacao } = (request.query ?? {}) as Record<string, unknown>;

    // `perPage` generoso: a tela de telemetria mostra a frota inteira em cards e
    // não tem controle de página. O envelope existe para a API ter uma forma só
    // de resposta — quando a frota crescer, o controle entra sem mudar contrato.
    const query = parseListQuery(paginacao, {
      sortable: ENDPOINT_SORTABLE,
      defaultSort: 'hostname',
      defaultOrder: 'asc',
      perPage: 500,
      maxPerPage: 1_000,
    });

    // Os filtros da F7 saem do `parseListQuery` de propósito: ele é do `core` e
    // não conhece vínculo nem triagem. Quem valida o que é do domínio é o schema
    // do domínio — e agora ele recebe SÓ o que é dele, então pode voltar a ser
    // estrito e pegar `?vinculo=nenhum` em vez de ignorar em silêncio.
    const filtros = endpointFilterSchema.parse({
      ...(vinculo === undefined ? {} : { vinculo }),
      ...(reviewState === undefined ? {} : { reviewState }),
    });

    return listEndpoints(query, filtros);
  },

  async command(request: FastifyRequest, reply: FastifyReply) {
    const { hwid } = hwidParamSchema.parse(request.params);
    const { action } = sendCommandSchema.parse(request.body ?? {});

    const { commandId } = await sendCommand(hwid, action);
    return reply.status(200).send({ message: 'Comando enviado.', commandId });
  },
};
