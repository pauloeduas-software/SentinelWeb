import type { FastifyReply, FastifyRequest } from 'fastify';
import { COOKIE_SESSAO, opcoesCookieSessao, opcoesLimparSessao } from '../helpers/session-cookie.helper';
import { loginSchema, trocarSenhaSchema } from '../schemas/auth.schema';
import { login } from '../use-cases/login.usecase';
import { recordAuditDoQueJaAconteceu } from '../../audit/use-cases/record-audit.usecase';
import { atorDaRequisicao } from '../helpers/actor.helper';
import { reemitirSessao } from '../helpers/emitir-sessao.helper';
import { changeOwnPassword } from '../use-cases/change-own-password.usecase';
import { updateUser } from '../../user/use-cases/update-user.usecase';
import { updateOwnProfileSchema } from '../../user/schemas/user.schema';

// A forma da sessão que o cliente recebe — a MESMA em login, `/me` e Minha conta,
// de propósito: as três alimentam o mesmo store no painel.
function sessaoParaOCliente(request: FastifyRequest) {
  return { ...request.user, role: request.cargo, mustChangePassword: request.deveTrocarSenha ?? false };
}

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
    const { usuario, tokenVersion, cargo, mustChangePassword } = await login(credenciais, request.id);

    // `tv` é a geração da sessão: conferida contra o banco a cada requisição
    // (authenticate-request.helper.ts), é ela que faz a troca de senha derrubar
    // quem já estava dentro.
    const token = await reply.jwtSign({ sub: usuario.id, tv: tokenVersion });

    // O token sai SÓ no cookie httpOnly (D22). Devolvê-lo também no corpo
    // criaria o caminho para o front guardá-lo no `localStorage` — e um XSS
    // passaria a exportar a sessão, que é exatamente o que o httpOnly impede.
    //
    // O corpo leva o usuário E as permissões — a MESMA forma de `/api/auth/me`,
    // de propósito: as duas rotas alimentam o mesmo store no painel, e formas
    // diferentes fariam o menu depender de por onde a sessão entrou.
    return reply
      .setCookie(COOKIE_SESSAO, token, opcoesCookieSessao())
      .send({ ...usuario, role: cargo, mustChangePassword });
  },

  async logout(request: FastifyRequest, reply: FastifyReply) {
    // A gravação que falhar não segura a sessão: o cookie sai do mesmo jeito.
    await recordAuditDoQueJaAconteceu({
      entityType: 'User', entityId: request.user.id, entityLabel: request.user.email, action: 'LOGOUT',
    }, atorDaRequisicao(request));
    // Sessão sem estado no servidor: sair é apagar o cookie. NÃO existe
    // `logout.usecase.ts` porque não há regra de negócio nenhuma aqui — o que
    // faltaria para haver (revogar UMA sessão específica, sessão por
    // dispositivo) exige uma tabela de sessão, que o sistema não tem. Quem
    // precisa derrubar TODAS as sessões de alguém troca a senha dela na edição
    // do usuário, que incrementa o `tokenVersion`. Fora isso, quem limita o
    // estrago é o TTL de 12 horas.

    return reply.clearCookie(COOKIE_SESSAO, opcoesLimparSessao()).send({ success: true });
  },

  // A rota que o painel chama ao abrir para saber se já está logado. O
  // `preHandler` global já releu o usuário no banco: aqui só devolve.
  /**
   * Quem está logado — MAIS o cargo dele.
   *
   * O cargo sai aqui de propósito, e só aqui. Ele não está no
   * `USER_PUBLIC_SELECT` justamente para não viajar embutido em toda posse e
   * toda ocupação; esta é a rota em que o cliente pergunta *sobre si mesmo*, e é
   * o único lugar onde a resposta "o que eu alcanço" faz sentido.
   *
   * PARA QUE O PAINEL PRECISA DISSO: para não desenhar o que vai dar 403. Um
   * item de menu que o cargo da sessão não alcança é um clique que leva a uma
   * tela que não carrega. Esconder não protege nada — a proteção é o
   * `preHandler` do servidor, que já recusou antes de qualquer tela existir —,
   * mas mostrar o que não funciona é defeito de interface.
   */
  async me(request: FastifyRequest) {
    return sessaoParaOCliente(request);
  },

  /**
   * Minha conta (AR): a pessoa edita o próprio nome. É o `updateUser` de sempre,
   * com o id da SESSÃO e só o campo que a conta pode mudar — nunca o corpo inteiro.
   */
  async atualizarPerfil(request: FastifyRequest) {
    const data = updateOwnProfileSchema.parse(request.body ?? {});
    const atualizado = await updateUser(request.user.id, data, request.user.id, atorDaRequisicao(request));
    return { ...sessaoParaOCliente(request), ...atualizado };
  },

  /**
   * A pessoa troca a própria senha (AR). Derruba as outras sessões e REEMITE o
   * cookie desta: quem trocou não é mandado de volta ao login.
   */
  async trocarSenha(request: FastifyRequest, reply: FastifyReply) {
    const data = trocarSenhaSchema.parse(request.body ?? {});
    await changeOwnPassword(request.user.id, data, atorDaRequisicao(request));
    await reemitirSessao(reply, request.user.id);
    // A troca zerou a marca da senha temporária: a resposta é a sessão já nova.
    return reply.send({ ...sessaoParaOCliente(request), mustChangePassword: false });
  },
};
