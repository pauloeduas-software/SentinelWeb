import type { Prisma } from '@prisma/client';
import type { USER_PUBLIC_SELECT } from '../user/helpers/user-select.helper';
import type { Permissao } from '../access/helpers/permission-catalog';

// Quem está logado, do ponto de vista do resto do sistema.
//
// Deriva do `USER_PUBLIC_SELECT` em vez de repetir os campos: aquela allowlist
// é o contrato do que pode sair de um usuário, e a sessão não é exceção. Campo
// novo em `users` (um `passwordHash`, por exemplo) não entra aqui sozinho —
// teria que ser escrito naquele arquivo, que é justamente onde a decisão é
// tomada com cuidado.
export type SessionUser = Prisma.UserGetPayload<{ select: typeof USER_PUBLIC_SELECT }>;

/**
 * O que o login devolve: quem entrou MAIS a geração da sessão dele.
 *
 * São duas coisas separadas porque têm destinos diferentes — o usuário vai no
 * corpo da resposta (a tela se desenha com ele), o `tokenVersion` vai DENTRO do
 * token assinado e nunca sai para o cliente. Devolver os dois juntos aqui é o
 * que evita o controller reler o usuário só para descobrir o número.
 *
 * O `tokenVersion` não entra no `USER_PUBLIC_SELECT` de propósito: ele não é
 * dado de usuário para exibir, é mecanismo de sessão. Aquela allowlist continua
 * sendo a única porta de saída do que o cliente vê.
 */
export interface SessaoEmitida {
  usuario: SessionUser;
  tokenVersion: number;
  /**
   * As permissões efetivas (F11) — união dos grupos da pessoa (D76).
   *
   * Terceira coisa com destino PRÓPRIO, somando-se às duas de cima: o usuário
   * vai no corpo, o `tokenVersion` vai dentro do token assinado, e isto vai no
   * corpo **sem** passar pelo `USER_PUBLIC_SELECT`. Não entra naquela allowlist
   * de propósito (D136): ela é o contrato do que SAI de um usuário e viaja
   * embutida em toda posse e toda ocupação — o JSON de permissões de cada grupo
   * em cada linha de histórico de todo ativo.
   *
   * `Set` aqui e array na resposta HTTP: `JSON.stringify(new Set())` devolve
   * `{}` em silêncio, então a conversão é do controller.
   */
  permissoes: Set<Permissao>;
}

// `request.user` passa a ter tipo de verdade em todo o backend.
//
// Sem isto, `request.user` é `{ [k: string]: any }` do @fastify/jwt e
// `request.user.id` compila mesmo quando não existe — exatamente o silêncio que
// o D23 quer evitar ao exigir o ator por parâmetro.
//
// `payload` é o que ASSINAMOS (o `sub` e a geração da sessão); `user` é o que o
// `preHandler` coloca na requisição depois de reler o usuário no banco. São
// diferentes de propósito: nome e e-mail dentro do token ficariam velhos no
// bolso de quem já está logado.
//
// `tv` (tokenVersion) é a EXCEÇÃO deliberada a essa regra, e cabe explicar por
// quê: ele está no token justamente para ser comparado com o banco, não para
// substituir a leitura. É um número sem significado fora daqui — não vaza nada
// sobre o usuário a quem conseguir decodificar o payload — e é o que permite
// invalidar toda sessão de alguém sem manter tabela de sessão aberta.
//
// Nome curto porque JWT viaja em cookie a cada requisição, e o payload inteiro
// é reassinado a cada login.
/**
 * O desafio de uma ida-e-volta de SSO (F11, Etapa I).
 *
 * Ele é assinado com o MESMO segredo da sessão e guardado num cookie próprio de
 * dez minutos (`oidc.controller.ts`). NÃO é uma sessão: não tem `sub`, não
 * autentica nada e o `preHandler` de sessão nem olha para ele — é um envelope
 * lacrado que só o par de rotas do SSO abre.
 */
export interface DesafioAssinado {
  state: string;
  nonce: string;
  codeVerifier: string;
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    /**
     * O que este sistema ASSINA, nas duas formas que existem.
     *
     * A união é deliberada, e declarar só a primeira forma foi o que o SSO
     * quebrou: `reply.jwtSign` herda este tipo, então assinar o desafio do OIDC
     * não compilava. A alternativa seria uma segunda biblioteca de JWT para
     * assinar dez minutos de `state` e `nonce` — dois caminhos de assinatura no
     * mesmo processo, com dois lugares para alguém esquecer de conferir algo.
     *
     * Quem VERIFICA passa o tipo esperado explicitamente
     * (`request.jwtVerify<{ sub, tv }>()`, `server.jwt.verify<DesafioAssinado>()`),
     * e é isso que mantém cada lado lendo o que ele espera: um cookie de sessão
     * apresentado no callback do SSO não tem `state` e falha na conferência.
     */
    payload: { sub: string; tv: number } | DesafioAssinado;
    user: SessionUser;
  }
}

// E COMO a requisição foi autenticada — cookie de sessão ou token pessoal
// (F11, Etapa H).
//
// POR QUE A DIFERENÇA PRECISA EXISTIR NA REQUISIÇÃO: um token pessoal é uma
// credencial de integração, de vida longa, colada num script. Ele age COMO a
// pessoa — mesmas permissões, mesmo `actorId` no log — e isso é o ponto dele.
// O que ele não pode fazer é mexer na PRÓPRIA credencial: trocar a senha,
// desligar o segundo fator ou emitir outro token. Um token que emite tokens é um
// token que não se revoga; um token que desliga o 2FA é o 2FA desligado.
//
// Então as rotas de credencial (`ROTA_DE_CREDENCIAL`, no maestro) exigem cookie,
// e é esta flag que elas leem. Opcional porque em rota pública não houve
// autenticação nenhuma — e `undefined` ali é a verdade.
declare module 'fastify' {
  interface FastifyRequest {
    /** `true` quando quem autenticou foi um `ApiToken` de `ownerType: 'USER'`. */
    autenticadoPorToken?: boolean;
    /** O id da linha de `api_tokens` usada — para o log dizer QUAL credencial agiu. */
    apiTokenId?: string;
  }
}
