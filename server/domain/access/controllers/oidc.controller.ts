import type { CookieSerializeOptions } from '@fastify/cookie';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { isProduction } from '../../../core/config/env';
import { AppError } from '../../../core/errors/app-error';
import { createLogger } from '../../../core/logger/logger';
import { contextoDaRequisicao } from '../../auth/helpers/request-context.helper';
import {
  COOKIE_SESSAO, opcoesCookieSessao,
} from '../../auth/helpers/session-cookie.helper';
import { lerConfiguracaoOidc } from '../helpers/directory-config.helper';
import {
  concluirLoginOidc, iniciarLoginOidc, type DesafioOidc,
} from '../use-cases/oidc-login.usecase';
// O `declare module` que ensina ao `jwtSign` a segunda forma de payload — a do
// desafio. Sem ele, assinar `state`/`nonce` não compila (o tipo da sessão é exato).
import '../../auth/auth.types';

// O TRANSPORTE DO SSO (F11, Etapa I): dois redirecionamentos e dois cookies.
//
// ═════════════════════════════════════════════════════════════════════════════
// POR QUE O DESAFIO (`state`, `nonce`, verificador do PKCE) VIAJA EM COOKIE
// ASSINADO, E NÃO FICA NUMA TABELA NEM NA MEMÓRIA DO PROCESSO.
//
//   memória do processo  dois contêineres atrás de um balanceador não a
//                        compartilham, e o callback pode cair no outro — o login
//                        falharia de forma intermitente, só em produção;
//   tabela no banco      uma linha por tentativa de login, com expurgo próprio,
//                        para guardar três strings por 60 segundos;
//   cookie assinado      o navegador que começou é o mesmo que volta. É o lugar
//                        natural do estado de uma ida-e-volta de UM cliente.
//
// Assinado com o MESMO `JWT_SECRET` da sessão, `httpOnly`, dez minutos de vida.
// Ele não é uma sessão: não tem `sub`, não autentica nada, e o `preHandler` de
// sessão nem olha para ele. É um envelope lacrado que só este par de rotas abre.
// ═════════════════════════════════════════════════════════════════════════════

const logger = createLogger('oidc.controller');

/** O cookie do desafio. Nome diferente do de sessão de propósito: são coisas diferentes. */
const COOKIE_DESAFIO = 'sentinel_oidc';

/** Dez minutos: o tempo de alguém digitar a senha e o MFA no provedor. */
const DESAFIO_SEGUNDOS = 10 * 60;

function atributosDoDesafio(): CookieSerializeOptions {
  return {
    httpOnly: true,
    // `lax` e NÃO `strict`: a volta do provedor é uma navegação vinda de OUTRO
    // site (login.microsoftonline.com → aqui). Com `strict` o navegador não
    // mandaria o cookie no callback, e o login falharia sempre — com a mensagem
    // de "desafio ausente", que parece ataque e é configuração.
    sameSite: 'lax',
    secure: isProduction,
    path: '/',
  };
}

export const oidcController = {
  /**
   * Começa: grava o desafio e manda o navegador para o provedor.
   *
   * 302 e não JSON com a URL: o clique no botão da tela de login navega para
   * esta rota, e um JSON obrigaria o painel a ler a resposta e redirecionar na
   * mão — com o cookie do desafio já gravado, mas numa requisição `fetch` que
   * pode ter sido feita por outra aba. Redirecionar aqui mantém tudo numa
   * navegação só.
   */
  async iniciar(_request: FastifyRequest, reply: FastifyReply) {
    const { url, ...desafio } = await iniciarLoginOidc();

    const lacrado = await reply.jwtSign(desafio, { expiresIn: DESAFIO_SEGUNDOS });

    return reply
      .setCookie(COOKIE_DESAFIO, lacrado, { ...atributosDoDesafio(), maxAge: DESAFIO_SEGUNDOS })
      .redirect(url, 302);
  },

  /**
   * A volta do provedor: confere, emite a sessão e manda para o painel.
   *
   * ⚠️ A URL ENTREGUE AO USE-CASE É MONTADA SOBRE A `OIDC_REDIRECT_URI`
   * CONFIGURADA, com a query da requisição por cima — NUNCA sobre o `Host` do
   * cabeçalho. Montar com o `Host` que o cliente mandou é como se constrói um
   * open redirect: bastaria um `Host:` forjado para a biblioteca validar a
   * resposta contra um endereço que não é o nosso.
   */
  async callback(request: FastifyRequest, reply: FastifyReply) {
    const config = lerConfiguracaoOidc();
    if (!config) throw new AppError('Entrada por SSO não configurada neste servidor.', 409);

    const lacrado = request.cookies[COOKIE_DESAFIO];
    if (!lacrado) {
      // Acontece de verdade em três casos inocentes: o cookie expirou (mais de
      // dez minutos no provedor), a pessoa abriu o callback direto, ou voltou num
      // navegador diferente do que começou. Nos três, mandar começar de novo é a
      // resposta — e é por isso que é 400 com frase legível, não 500.
      throw new AppError(
        'A tentativa de entrada expirou ou começou em outro navegador. Tente entrar novamente.',
        400,
      );
    }

    let desafio: DesafioOidc;
    try {
      desafio = request.server.jwt.verify<DesafioOidc>(lacrado);
    } catch {
      // Assinatura inválida é outra coisa: alguém montou um cookie. Não vira
      // mensagem detalhada.
      logger.warn('[OIDC] Cookie de desafio com assinatura inválida.');
      throw new AppError('Tentativa de entrada inválida. Comece novamente.', 400);
    }

    const query = request.url.includes('?') ? request.url.slice(request.url.indexOf('?')) : '';
    const urlAtual = new URL(config.redirectUri + query);

    const { usuario, tokenVersion } = await concluirLoginOidc(
      urlAtual,
      desafio,
      contextoDaRequisicao(request),
    );

    const token = await reply.jwtSign({ sub: usuario.id, tv: tokenVersion });

    // O desafio morre aqui: ele vale para UMA ida-e-volta. Deixá-lo no navegador
    // permitiria reapresentar o mesmo `state` num segundo callback.
    return reply
      .clearCookie(COOKIE_DESAFIO, atributosDoDesafio())
      .setCookie(COOKIE_SESSAO, token, opcoesCookieSessao())
      // Para a RAIZ do painel, não para uma URL vinda da query: aceitar um
      // `?next=` do provedor seria dar a ele (ou a quem montar o link) o poder de
      // escolher para onde o navegador vai com uma sessão recém-criada.
      .redirect('/', 302);
  },
};
