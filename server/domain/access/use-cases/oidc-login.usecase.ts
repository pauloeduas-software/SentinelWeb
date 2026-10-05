import * as oidc from 'openid-client';
import { prisma } from '../../../core/database/prismaClient';
import { AppError } from '../../../core/errors/app-error';
import { createLogger } from '../../../core/logger/logger';
import { carregarSessaoParaValidacao } from '../../auth/use-cases/current-user.usecase';
import { registrarEventoAuth } from '../../auth/use-cases/record-auth-event.usecase';
import type { ContextoDaRequisicao } from '../../auth/helpers/request-context.helper';
import type { SessaoEmitida } from '../../auth/auth.types';
import { lerConfiguracaoOidc, type ConfiguracaoOidc } from '../helpers/directory-config.helper';

// O LOGIN POR SSO — OIDC, não SAML (F11, Etapa I — D78).
//
// ═════════════════════════════════════════════════════════════════════════════
// AS TRÊS DECISÕES DESTE ARQUIVO.
//
// 1. **NINGUÉM ENTRA SEM CADASTRO.** O provedor de identidade autenticar alguém
//    não cria conta aqui. Provisionar no primeiro login (*JIT provisioning*) é
//    cômodo e transforma o diretório inteiro em operadores do inventário — todo
//    estagiário com conta no tenant passaria a ter sessão válida. Quem traz gente
//    para dentro é a sincronização (`sync-ldap.usecase.ts`) ou uma pessoa, e as
//    duas deixam rastro.
//
// 2. **Conta `LOCAL` com o mesmo e-mail é RECUSADA, não fundida.** Quem controla
//    um e-mail no provedor herdaria os grupos de uma conta criada aqui — incluindo
//    o `Administrador`. O vínculo é explícito: alguém com `access.manage` muda a
//    origem da identidade da pessoa (`PUT /api/users/:id/auth-source`), e só então
//    o SSO a encontra.
//
// 3. **`state` e `nonce` são obrigatórios e conferidos**, com PKCE por cima. Os
//    três valores não ficam em memória do processo (dois contêineres atrás de um
//    balanceador não compartilham memória, e o callback pode cair no outro): eles
//    viajam num cookie httpOnly de vida curta, assinado com o MESMO `JWT_SECRET`
//    da sessão. Quem assina e grava é o controller — transporte é dele.
//
// ⚠️ O QUE ESTE CAMINHO NÃO FAZ, E É PRECISO SABER: ele **não pede o segundo
// fator local**. Se a pessoa tem TOTP ativo aqui e entra por SSO, o código não é
// exigido — a verificação de identidade é a do provedor, que tem o MFA dele. Isso
// é uma troca consciente: exigir o código depois do redirecionamento pediria uma
// meia-sessão no servidor (o estado que o `useLogin.ts` recusou criar), e o que
// limita o risco é a decisão 2 — o SSO só alcança contas que alguém marcou
// explicitamente como federadas. Se o provedor não exigir MFA, o 2FA local daquela
// conta deixa de valer nesse caminho; a resposta certa é exigir MFA no provedor.
// ═════════════════════════════════════════════════════════════════════════════

const logger = createLogger('oidc');

/**
 * O escopo pedido, e nada além.
 *
 * `openid` é obrigatório; `profile` traz o nome; `email` traz o endereço, que é
 * como a pessoa é encontrada aqui. Nada de `User.Read` nem de escopo de
 * aplicação: este sistema não chama a API do provedor — ele só quer saber quem
 * acabou de provar a identidade.
 */
const ESCOPO = 'openid profile email';

/**
 * A configuração descoberta, em cache de processo.
 *
 * O `discovery` é uma requisição HTTP ao provedor (o `.well-known`), e fazê-la a
 * cada clique no botão de entrar somaria a latência dele a todo login — e
 * transformaria uma indisponibilidade momentânea do endpoint de metadados em
 * "ninguém entra". Em cache, o custo é uma vez por processo.
 *
 * O PREÇO ACEITO: rotação de chave de assinatura do provedor só é percebida no
 * próximo boot. A biblioteca busca o JWKS por conta própria quando encontra um
 * `kid` desconhecido, então o caso comum se resolve sozinho; o que fica velho é
 * endpoint mudando de lugar, que não acontece sem aviso.
 */
let cache: { chave: string; configuracao: oidc.Configuration } | null = null;

async function descobrir(config: ConfiguracaoOidc): Promise<oidc.Configuration> {
  // A chave do cache inclui o issuer E o client: trocar qualquer um dos dois no
  // ambiente tem de invalidar o que foi descoberto.
  const chave = `${config.issuer}|${config.clientId}`;
  if (cache?.chave === chave) return cache.configuracao;

  const configuracao = await oidc.discovery(
    new URL(config.issuer),
    config.clientId,
    config.clientSecret,
  );

  cache = { chave, configuracao };
  return configuracao;
}

/** A configuração, ou 409 — o SSO está desligado quando não há `.env`. */
function exigirConfiguracao(): ConfiguracaoOidc {
  const config = lerConfiguracaoOidc();
  if (!config) {
    throw new AppError(
      'Entrada por SSO não configurada neste servidor.',
      409,
    );
  }
  return config;
}

/** O que o controller precisa guardar no cookie de ida e conferir na volta. */
export interface DesafioOidc {
  state: string;
  nonce: string;
  codeVerifier: string;
}

export interface InicioDoLoginOidc extends DesafioOidc {
  /** Para onde redirecionar o navegador. */
  url: string;
}

/**
 * Monta a URL de autorização, com PKCE.
 *
 * PKCE mesmo havendo `client_secret` (o fluxo é confidencial): ele fecha a janela
 * em que um código de autorização interceptado — num log de proxy, no histórico do
 * navegador, numa extensão — pode ser trocado por token. Custa um hash.
 */
export async function iniciarLoginOidc(): Promise<InicioDoLoginOidc> {
  const config = exigirConfiguracao();
  const descoberta = await descobrir(config);

  const codeVerifier = oidc.randomPKCECodeVerifier();
  const codeChallenge = await oidc.calculatePKCECodeChallenge(codeVerifier);
  const state = oidc.randomState();
  const nonce = oidc.randomNonce();

  const url = oidc.buildAuthorizationUrl(descoberta, {
    redirect_uri: config.redirectUri,
    scope: ESCOPO,
    state,
    nonce,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });

  return { url: url.href, state, nonce, codeVerifier };
}

/** O que o ID Token nos diz, já normalizado. */
interface IdentidadeFederada {
  /** O id estável no provedor: `oid` no Entra, `sub` nos demais. */
  externalId: string;
  email: string;
  name: string | null;
}

/**
 * Lê as reivindicações do ID Token.
 *
 * `oid` ANTES de `sub`, e isto é específico do Entra ID: o `sub` dele é *pairwise*
 * — diferente por aplicação —, então usá-lo amarraria a conta a ESTE registro de
 * aplicativo. Recriar o app no portal (ou publicar um segundo) geraria `sub` novo
 * para a mesma pessoa, e todo mundo perderia o vínculo de uma vez. O `oid` é o id
 * do objeto no tenant: o mesmo para qualquer aplicativo.
 */
function lerIdentidade(claims: Record<string, unknown>): IdentidadeFederada | null {
  const oid = typeof claims.oid === 'string' ? claims.oid : null;
  const sub = typeof claims.sub === 'string' ? claims.sub : null;
  const identificador = oid ?? sub;

  // `email` pode faltar quando o tenant não libera o claim; `preferred_username`
  // é o UPN e cobre o caso. Sem nenhum dos dois não há como encontrar a pessoa
  // aqui — e inventar um e-mail a partir do `sub` criaria cadastro fantasma.
  const email = [claims.email, claims.preferred_username]
    .find((valor): valor is string => typeof valor === 'string' && valor.includes('@'))
    ?.toLowerCase() ?? null;

  if (!identificador || !email) return null;

  return {
    externalId: `oidc:${identificador}`,
    email,
    name: typeof claims.name === 'string' ? claims.name : null,
  };
}

/** A recusa do D78, com a trilha gravada. Frase única: o motivo não é público. */
async function recusar(
  identificacao: string,
  motivoInterno: string,
  ctx?: ContextoDaRequisicao,
): Promise<never> {
  await registrarEventoAuth({ type: 'OIDC_DENIED', username: identificacao, ctx });
  logger.warn(`[OIDC] Login recusado para ${identificacao}: ${motivoInterno}`);

  // A MENSAGEM NÃO DIZ QUAL DOS CASOS FOI, pelo mesmo motivo das três recusas do
  // login (docs/referencia/acesso.md): "não existe aqui", "existe como conta local" e
  // "está desligada" são três fatos diferentes sobre a conta de outra pessoa, e
  // quem está do lado de fora não tem o que fazer com a diferença. Quem precisa
  // da diferença é o administrador, e ela está no `auth_events` e no log.
  throw new AppError(
    'Este acesso não está habilitado para entrada única. Procure quem administra o sistema.',
    403,
  );
}

/**
 * Conclui o login: troca o código por token, confere tudo e devolve a sessão.
 *
 * Devolve `SessaoEmitida` — a MESMA forma do `login.usecase.ts` — porque o que
 * acontece depois é idêntico: o controller assina o JWT e grava o cookie. Duas
 * formas de "sessão emitida" significariam dois jeitos de montar o cookie, e um
 * deles ficaria sem o `tv` no primeiro refactor.
 */
export async function concluirLoginOidc(
  urlAtual: URL,
  desafio: DesafioOidc,
  ctx?: ContextoDaRequisicao,
): Promise<SessaoEmitida> {
  const config = exigirConfiguracao();
  const descoberta = await descobrir(config);

  // AS TRÊS CONFERÊNCIAS NUMA CHAMADA: `state` (CSRF), `nonce` (replay do ID
  // Token) e o verificador do PKCE. A biblioteca lança quando qualquer uma falha,
  // e o erro cai no error-handler como 500 — o que é o certo: não é o cliente que
  // está errado, é a volta que não corresponde à ida.
  const tokens = await oidc.authorizationCodeGrant(descoberta, urlAtual, {
    pkceCodeVerifier: desafio.codeVerifier,
    expectedState: desafio.state,
    expectedNonce: desafio.nonce,
  });

  const claims = tokens.claims();
  const identidade = claims ? lerIdentidade(claims as Record<string, unknown>) : null;
  if (!identidade) {
    throw new AppError(
      'O provedor de identidade não devolveu e-mail. Libere o claim de e-mail para este aplicativo.',
      502,
    );
  }

  // ── QUEM É ESTA PESSOA AQUI DENTRO ────────────────────────────────────────
  //
  // Primeiro pelo identificador do provedor; depois pelo e-mail. A ordem importa:
  // o e-mail muda (casamento, troca de domínio) e o `oid` não.
  const porId = await prisma.user.findFirst({
    where: { externalId: identidade.externalId },
    select: { id: true, isActive: true },
  });

  let userId: string;

  if (porId) {
    if (!porId.isActive) return recusar(identidade.email, 'conta desligada', ctx);
    userId = porId.id;
  } else {
    const porEmail = await prisma.user.findFirst({
      where: { email: identidade.email },
      select: { id: true, isActive: true, authSource: true, externalId: true },
    });

    // `return recusar(...)` e não `await recusar(...)`: as duas lançam igual em
    // tempo de execução, mas só o `return` faz o TypeScript ESTREITAR `porEmail`
    // para não-nulo nas linhas seguintes. Com `await`, o compilador não sabe que a
    // função nunca volta — e o `porEmail.authSource` abaixo não compilaria.
    if (!porEmail) {
      return recusar(identidade.email, 'não existe cadastro com este e-mail', ctx);
    }
    if (porEmail.authSource === 'LOCAL') {
      return recusar(identidade.email, 'conta LOCAL exige vínculo explícito (D78)', ctx);
    }
    if (!porEmail.isActive) {
      return recusar(identidade.email, 'conta desligada', ctx);
    }

    // O VÍNCULO, e as duas linhas de `data` têm cada uma o seu motivo:
    //
    // `authSource: 'OIDC'` — a partir de agora esta conta entra por SSO, e isso
    //   fica gravado. Uma conta `LDAP` que entra por SSO vira `OIDC`: as duas são
    //   "vem do diretório corporativo", e a diferença é por onde ela ENTRA.
    //
    // `externalId` só quando está VAZIO — e isto evita um ping-pong diário. Numa
    //   instalação híbrida, a pessoa já tem `guid:…` gravado pela sincronização
    //   LDAP, que é a âncora de LÁ. Sobrescrever com `oidc:…` faria o job seguinte
    //   não encontrá-la pelo identificador, re-vinculá-la por e-mail e gravar o
    //   `guid:` de volta — todo dia, para sempre. Com a âncora preservada, o SSO
    //   dela passa a casar pelo e-mail, que a própria sincronização mantém em dia.
    await prisma.user.update({
      where: { id: porEmail.id },
      data: {
        authSource: 'OIDC',
        ...(porEmail.externalId ? {} : { externalId: identidade.externalId }),
      },
    });

    userId = porEmail.id;
  }

  // Nome do provedor sobrescreve o local? NÃO. O nome aqui pode ter sido
  // corrigido à mão ("J. Silva" → "Joana Silva"), e o SSO não é a fonte de
  // verdade do cadastro — a sincronização é, e ela roda com regra própria.
  await prisma.user.update({
    where: { id: userId },
    data: { lastLoginAt: new Date(), failedLoginCount: 0, lockedUntil: null },
  });

  // A MESMA releitura de todo login: é ela que garante que o `USER_PUBLIC_SELECT`
  // continua sendo a única porta de saída de um usuário, e que as permissões saem
  // da mesma consulta (D136).
  const sessao = await carregarSessaoParaValidacao(userId);
  if (!sessao) return recusar(identidade.email, 'sessão não carregou depois do vínculo', ctx);

  await registrarEventoAuth({
    type: 'LOGIN_OK',
    userId,
    // O `username` guarda o e-mail do PROVEDOR: numa auditoria, é o que liga a
    // linha daqui à linha de lá.
    username: identidade.email,
    ctx,
  });

  return sessao;
}
