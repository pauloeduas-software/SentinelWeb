import type { Prisma } from '@prisma/client';
import type { USER_PUBLIC_SELECT } from '../user/helpers/user-select.helper';

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
declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string; tv: number };
    user: SessionUser;
  }
}
