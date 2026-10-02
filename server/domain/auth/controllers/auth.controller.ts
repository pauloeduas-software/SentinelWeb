import type { FastifyReply, FastifyRequest } from 'fastify';
import { idParamSchema } from '../../shared/params.schema';
import {
  issueApiToken, listApiTokens, revokeApiToken,
} from '../use-cases/manage-api-tokens.usecase';
import {
  confirmarCadastroTotp, desativarTotp, iniciarCadastroTotp, statusDoTotp,
} from '../use-cases/manage-totp.usecase';
import { atorDaRequisicao, sessaoDaRequisicao } from '../helpers/actor.helper';
import { COOKIE_SESSAO, opcoesCookieSessao, opcoesLimparSessao } from '../helpers/session-cookie.helper';
import { contextoDaRequisicao } from '../helpers/request-context.helper';
import {
  confirmarTotpSchema, desativarTotpSchema, issueTokenSchema, loginSchema, setPasswordSchema,
} from '../schemas/auth.schema';
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
    const { usuario, tokenVersion, permissoes } = await login(credenciais, contextoDaRequisicao(request));

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
      .send({ ...usuario, permissions: [...permissoes] });
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
  /**
   * Quem está logado — MAIS o que ele alcança.
   *
   * As permissões saem aqui de propósito, e só aqui. Elas não estão no
   * `USER_PUBLIC_SELECT` (D136) justamente para não viajarem embutidas em toda
   * posse e toda ocupação; esta é a rota em que o cliente pergunta *sobre si
   * mesmo*, e é o único lugar onde a resposta "o que eu posso" faz sentido.
   *
   * PARA QUE O PAINEL PRECISA DISSO: para não desenhar o que vai dar 403. Um
   * menu com *Importar* para quem não tem `imports.manage` é um clique que leva
   * a uma tela que não carrega. Esconder não protege nada — a proteção é o
   * `preHandler` do servidor, que já recusou antes de qualquer tela existir —,
   * mas mostrar o que não funciona é defeito de interface.
   *
   * `[...]` porque `Set` não tem serialização em JSON: `JSON.stringify(new Set)`
   * devolve `{}`, silenciosamente. Array aqui, `Set` do outro lado.
   */
  async me(request: FastifyRequest) {
    return { ...request.user, permissions: [...(request.permissions ?? [])] };
  },

  async setPassword(request: FastifyRequest) {
    const { id } = idParamSchema.parse(request.params);
    const data = setPasswordSchema.parse(request.body ?? {});
    return setUserPassword(id, data, atorDaRequisicao(request), contextoDaRequisicao(request));
  },

  // ------------------------------------------------- tokens do agente (D80)
  //
  // O ESCOPO É ESCRITO EM TODA CHAMADA, e não é redundância: as mesmas três
  // funções servem o token PESSOAL logo abaixo (F11, Etapa H). Um padrão
  // implícito — "sem escopo quer dizer agente" — faria a rota pessoal que
  // esquecesse o parâmetro listar a frota inteira.
  async listarTokens() {
    return listApiTokens({ ownerType: 'AGENT' });
  },

  // 201 com o SEGREDO no corpo — a única vez que ele existe fora do agente.
  // Não há rota para relê-lo, e é essa ausência que faz o sha256 valer alguma
  // coisa: nem quem lê o dump do banco consegue autenticar.
  async emitirToken(request: FastifyRequest, reply: FastifyReply) {
    const { name } = issueTokenSchema.parse(request.body ?? {});
    const token = await issueApiToken(name, { ownerType: 'AGENT' }, atorDaRequisicao(request));
    return reply.status(201).send(token);
  },

  async revogarToken(request: FastifyRequest) {
    const { id } = idParamSchema.parse(request.params);
    return revokeApiToken(id, { ownerType: 'AGENT' }, atorDaRequisicao(request));
  },

  // ----------------------------------------------- o token PESSOAL (F11, H)
  //
  // AS TRÊS ROTAS SÃO `/api/me/...` E NÃO `/api/users/:id/tokens`, e a diferença
  // é de segurança, não de estética: sem `:id` na URL não existe o caso "mandei o
  // id de outra pessoa". O dono sai da SESSÃO, pelo mesmo princípio do
  // `atorDaRequisicao` — o que o cliente manda nunca decide de quem é a credencial.
  //
  // E é por isso que não há rota para um administrador emitir token no nome de
  // alguém: o token age COMO a pessoa, e emiti-lo por ela seria assinar no nome
  // dela. Quem precisa de uma credencial de integração emite a própria, ou usa um
  // token de agente, que é da máquina e tem dono declarado.
  async listarMeusTokens(request: FastifyRequest) {
    const { userId } = sessaoDaRequisicao(request);
    return listApiTokens({ ownerType: 'USER', userId });
  },

  async emitirMeuToken(request: FastifyRequest, reply: FastifyReply) {
    const { userId } = sessaoDaRequisicao(request);
    const { name } = issueTokenSchema.parse(request.body ?? {});
    const token = await issueApiToken(name, { ownerType: 'USER', userId }, userId);
    return reply.status(201).send(token);
  },

  async revogarMeuToken(request: FastifyRequest) {
    const { userId } = sessaoDaRequisicao(request);
    const { id } = idParamSchema.parse(request.params);
    return revokeApiToken(id, { ownerType: 'USER', userId }, userId);
  },

  // ----------------------------------------------- o segundo fator (F11, H)
  async statusDoSegundoFator(request: FastifyRequest) {
    const { userId } = sessaoDaRequisicao(request);
    return statusDoTotp(userId);
  },

  // 200 com o SEGREDO e o QR no corpo. É a única resposta do sistema que carrega
  // um segredo do próprio solicitante, e a rota é de credencial por isso
  // (`no-store`, `Origin` conferida) — ver `ROTA_DE_CREDENCIAL` no maestro.
  async iniciarSegundoFator(request: FastifyRequest) {
    const { userId } = sessaoDaRequisicao(request);
    return iniciarCadastroTotp(userId);
  },

  // 200 com os códigos de recuperação, uma vez e nunca mais.
  async confirmarSegundoFator(request: FastifyRequest) {
    const { userId } = sessaoDaRequisicao(request);
    const { totp } = confirmarTotpSchema.parse(request.body ?? {});
    return confirmarCadastroTotp(userId, totp, contextoDaRequisicao(request));
  },

  async desativarSegundoFator(request: FastifyRequest) {
    const { userId } = sessaoDaRequisicao(request);
    const { codigo } = desativarTotpSchema.parse(request.body ?? {});
    return desativarTotp(userId, codigo, contextoDaRequisicao(request));
  },
};
