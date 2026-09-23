import type { FastifyReply, FastifyRequest } from 'fastify';
import { idParamSchema } from '../../shared/params.schema';
import {
  issueAgentToken, listAgentTokens, revokeAgentToken,
} from '../use-cases/manage-api-tokens.usecase';
import { atorDaRequisicao } from '../helpers/actor.helper';
import { COOKIE_SESSAO, opcoesCookieSessao, opcoesLimparSessao } from '../helpers/session-cookie.helper';
import { contextoDaRequisicao } from '../helpers/request-context.helper';
import { issueTokenSchema, loginSchema, setPasswordSchema } from '../schemas/auth.schema';
import { login } from '../use-cases/login.usecase';
import { registrarEventoAuth } from '../use-cases/record-auth-event.usecase';
import { setUserPassword } from '../use-cases/set-user-password.usecase';

// Só HTTP. Sem try/catch: os `AppError` do use-case (401 de credencial, 423 de
// conta travada, 403 de acesso desativado) caem no errorHandler, que é o único
// lugar do sistema que monta resposta de erro.
//
// O que é HTTP e mora aqui, não no use-case: assinar o JWT e gravar o cookie.
// O use-case decide QUEM entrou; como essa decisão viaja até o navegador é
// transporte, e o `login.usecase.ts` continua sem saber o que é um cookie.
export const authController = {
  async login(request: FastifyRequest, reply: FastifyReply) {
    const credenciais = loginSchema.parse(request.body ?? {});
    const { usuario, tokenVersion } = await login(credenciais, contextoDaRequisicao(request));

    // `tv` é a geração da sessão: conferida contra o banco a cada requisição
    // (authenticate-request.helper.ts), é ela que faz a troca de senha derrubar
    // quem já estava dentro.
    const token = await reply.jwtSign({ sub: usuario.id, tv: tokenVersion });

    // O token sai SÓ no cookie httpOnly (D22). Devolvê-lo também no corpo
    // criaria o caminho para o front guardá-lo no `localStorage` — e um XSS
    // passaria a exportar a sessão, que é exatamente o que o httpOnly impede.
    // O corpo leva o usuário, que é o que a tela precisa para se desenhar.
    return reply.setCookie(COOKIE_SESSAO, token, opcoesCookieSessao()).send(usuario);
  },

  async logout(request: FastifyRequest, reply: FastifyReply) {
    // Sessão sem estado no servidor: sair é apagar o cookie. NÃO existe
    // `logout.usecase.ts` porque não há regra de negócio nenhuma aqui — o que
    // faltaria para haver (revogar UMA sessão específica, sessão por
    // dispositivo) exige a tabela de sessão da Etapa G. Quem precisa derrubar
    // TODAS as sessões de alguém hoje tem o `set-password`, que incrementa o
    // `tokenVersion`. Até lá, quem limita o estrago é o TTL de 8 horas.
    //
    // O evento é gravado ANTES de limpar o cookie porque depois disso não há
    // mais de quem falar: `request.user` vem do `preHandler`, e é nulo se a
    // sessão já tinha expirado (sair duas vezes é legítimo e responde 200).
    if (request.user) {
      await registrarEventoAuth({
        type: 'LOGOUT',
        userId: request.user.id,
        ctx: contextoDaRequisicao(request),
      });
    }

    return reply.clearCookie(COOKIE_SESSAO, opcoesLimparSessao()).send({ success: true });
  },

  // A rota que o painel chama ao abrir para saber se já está logado. O
  // `preHandler` global já releu o usuário no banco: aqui só devolve.
  async me(request: FastifyRequest) {
    return request.user;
  },

  async setPassword(request: FastifyRequest) {
    const { id } = idParamSchema.parse(request.params);
    const data = setPasswordSchema.parse(request.body ?? {});
    return setUserPassword(id, data, atorDaRequisicao(request), contextoDaRequisicao(request));
  },

  // ------------------------------------------------- tokens do agente (D80)
  async listarTokens() {
    return listAgentTokens();
  },

  // 201 com o SEGREDO no corpo — a única vez que ele existe fora do agente.
  // Não há rota para relê-lo, e é essa ausência que faz o sha256 valer alguma
  // coisa: nem quem lê o dump do banco consegue autenticar.
  async emitirToken(request: FastifyRequest, reply: FastifyReply) {
    const { name } = issueTokenSchema.parse(request.body ?? {});
    const token = await issueAgentToken(name, atorDaRequisicao(request));
    return reply.status(201).send(token);
  },

  async revogarToken(request: FastifyRequest) {
    const { id } = idParamSchema.parse(request.params);
    return revokeAgentToken(id, atorDaRequisicao(request));
  },
};
