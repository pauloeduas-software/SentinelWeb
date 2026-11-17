import type { FastifyReply, FastifyRequest } from 'fastify';
import { parseListQuery } from '../../../infra/http/list-query';
import { endpointFilterSchema, sendCommandSchema } from '../schemas/endpoint.schema';
import { idParamSchema } from '../../shared/params.schema';
import { atorDaRequisicao } from '../../auth/helpers/actor.helper';
import { listEndpoints } from '../use-cases/list-endpoints.usecase';
import { getEndpoint } from '../use-cases/get-endpoint.usecase';
import { sendCommand } from '../use-cases/send-command.usecase';
import { excluirMaquina } from '../use-cases/delete-endpoint.usecase';

// Só HTTP: lê a requisição, chama o use-case, devolve a resposta. Sem
// try/catch — no Fastify o handler async que rejeita cai no errorHandler
// registrado em infra/errors/error-handler.ts.
export const endpointController = {
  async list(request: FastifyRequest) {
    // A QUERY TEM DOIS DONOS, E POR ISSO É SEPARADA ANTES DE QUALQUER `parse`.
    //
    // `vista` é do domínio; o resto (`page`, `perPage`, `q`) é do
    // `parseListQuery` — que é `strictObject` e RECUSA qualquer chave que não
    // conheça. Entregar a query inteira aos dois dava 422 em requisição válida:
    // o filtro respondia *campo não reconhecido*, e ele
    // ficava inalcançável por HTTP — implementado no helper, tipado no use-case
    // e morto na borda.
    //
    // É o mesmo trecho que `workstation.controller.ts` já tinha, com a mesma
    // nota explicando o motivo. Ele foi escrito porque o problema tinha
    // acontecido lá; aqui o erro foi refeito em vez de copiar a solução.
    const { vista, ...paginacao } = (request.query ?? {}) as Record<string, unknown>;

    // `perPage` generoso: `/agentes` lê a frota inteira de cada vista, e não
    // tem controle de página. O envelope existe para
    // a API ter uma forma só de resposta — quando a frota crescer, o controle
    // entra sem mudar contrato. Quem quer UMA máquina usa `GET /api/endpoints/:id`.
    const query = parseListQuery(paginacao, {
      perPage: 500,
      maxPerPage: 1_000,
    });

    // Os filtros saem do `parseListQuery` de propósito: ele é do `core` e
    // não conhece as vistas. Quem valida o que é do domínio é o schema
    // do domínio — e agora ele recebe SÓ o que é dele, então pode voltar a ser
    // estrito e pegar `?vista=nenhuma` em vez de ignorar em silêncio.
    const filtros = endpointFilterSchema.parse(vista === undefined ? {} : { vista });

    return listEndpoints(query, filtros);
  },

  async detail(request: FastifyRequest) {
    const { id } = idParamSchema.parse(request.params);
    return getEndpoint(id);
  },

  async command(request: FastifyRequest, reply: FastifyReply) {
    const { id } = idParamSchema.parse(request.params);
    const { action } = sendCommandSchema.parse(request.body ?? {});

    const { commandId } = await sendCommand(id, action, atorDaRequisicao(request));
    return reply.status(200).send({ message: 'Comando enviado.', commandId });
  },

  async remove(request: FastifyRequest) {
    const { id } = idParamSchema.parse(request.params);
    await excluirMaquina(id, atorDaRequisicao(request));
    return { message: 'Máquina excluída.' };
  },
};
