import type { FastifyReply, FastifyRequest } from 'fastify';
import { AppError } from '../../../infra/errors/app-error';
import { conferirSegredoDeCadastro } from '../helpers/authenticate-agent.helper';
import { enrollSchema } from '../schemas/agent.schema';
import { enrollAgent } from '../use-cases/enroll-agent.usecase';

// Só HTTP: lê a requisição, chama o use-case, devolve a resposta. Sem
// try/catch — no Fastify o handler async que rejeita cai no errorHandler
// registrado em infra/errors/error-handler.ts.
export const agentController = {
  async enroll(request: FastifyRequest, reply: FastifyReply) {
    if (!conferirSegredoDeCadastro(request.headers.authorization)) {
      request.log.warn({ ip: request.socket.remoteAddress }, '[Agent] Cadastro recusado: segredo de instalação inválido.');
      throw new AppError('Segredo de instalação inválido.', 401);
    }

    const { Hwid } = enrollSchema.parse(request.body ?? {});
    const { token } = await enrollAgent(Hwid);
    return reply.status(201).send({ Token: token });
  },
};
