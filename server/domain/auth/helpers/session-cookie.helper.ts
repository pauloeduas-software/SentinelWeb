import type { CookieSerializeOptions } from '@fastify/cookie';
import { isProduction } from '../../../core/config/env';

// O cookie de sessão — D22 do docs/FASE-3-PLANO-ITAM.md.
//
// `httpOnly` é a decisão inteira em uma palavra: um XSS em qualquer tela do
// painel lê o `localStorage` inteiro e leva a sessão embora para sempre; o
// mesmo XSS contra um cookie httpOnly consegue USAR a sessão enquanto a aba
// está aberta, mas não EXPORTÁ-LA. O preço é CSRF, e ele se paga com
// `SameSite` mais o CORS com allowlist que a F0 já deixou pronto.
export const COOKIE_SESSAO = 'sentinel_sessao';

/**
 * Validade do JWT e do cookie, juntas.
 *
 * Horas, não dias: mandar alguém para a lixeira NÃO invalida o token que ele já
 * tem no navegador. O `preHandler` relê o usuário a cada requisição (e é essa a
 * defesa real), mas o TTL curto é o que limita o estrago se um token vazar.
 */
export const SESSAO_SEGUNDOS = 8 * 60 * 60;

/**
 * Os atributos que precisam ser IDÊNTICOS na gravação e na limpeza.
 *
 * O navegador só remove um cookie quando `path`, `sameSite` e `secure` batem
 * com os da gravação — divergir deixa o logout "funcionando" com a sessão ainda
 * de pé no navegador. Uma função só, usada pelos dois lados, é o que impede as
 * duas listas de divergirem no primeiro ajuste.
 */
function atributosDoCookie(): CookieSerializeOptions {
  return {
    httpOnly: true,
    // `Lax`, não `Strict`: em desenvolvimento o painel roda na 3000 e a API na
    // 3001, e `Strict` faria o navegador simplesmente não enviar o cookie — o
    // sintoma é 401 em tudo depois de um login que respondeu 200, sem erro
    // nenhum no console (docs/FASE-3-PLANO-ITAM.md, "Riscos e armadilhas").
    sameSite: 'lax',
    // Só em produção: `Secure` em http://localhost faz o navegador descartar o
    // cookie em silêncio.
    secure: isProduction,
    // Raiz, para o cookie valer tanto em /api quanto no painel estático.
    path: '/',
  };
}

export function opcoesCookieSessao(): CookieSerializeOptions {
  return { ...atributosDoCookie(), maxAge: SESSAO_SEGUNDOS };
}

/** As mesmas opções, sem `maxAge`: é a limpeza do cookie no logout. */
export function opcoesLimparSessao(): CookieSerializeOptions {
  return atributosDoCookie();
}
