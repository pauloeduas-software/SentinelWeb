import type { Permissao } from './helpers/permission-catalog';

// `request.permissions` ganha tipo de verdade em todo o backend.
//
// ═══════════════════════════════════════════════════════════════════════════
// POR QUE NÃO DENTRO DE `request.user` (D136).
//
// `request.user` é o `SessionUser`, e `SessionUser` é
// `Prisma.UserGetPayload<{ select: typeof USER_PUBLIC_SELECT }>` — ou seja, é
// literalmente a allowlist do que pode SAIR de um usuário
// (`user/helpers/user-select.helper.ts`). Pôr permissão lá teria dois efeitos,
// os dois ruins:
//
// 1. a allowlist deixaria de responder "o que é público de um usuário" e
//    passaria a responder também "o que ele pode fazer" — que não é dado dele;
//
// 2. o `USER_PUBLIC_SELECT` vai EMBUTIDO em toda posse, toda ocupação e todo
//    `assignedTo` do inventário. O JSON de permissões de cada grupo viajaria em
//    cada linha de histórico de todo ativo. É o mesmo argumento que já manteve
//    `isActive` e `terminatedAt` num select separado (`USER_DETAIL_SELECT`).
//
// Então a permissão é um campo IRMÃO na requisição: lido na mesma consulta,
// usado pelo `preHandler`, e nunca serializado para o cliente. Quem quer saber
// o próprio acesso pede `GET /api/auth/me`, que o devolve de propósito.
//
// `Set` e não array: a pergunta é sempre "tem esta chave?", feita uma vez por
// requisição. Em array isso é varredura; aqui é `has`.
// ═══════════════════════════════════════════════════════════════════════════

declare module 'fastify' {
  interface FastifyRequest {
    /**
     * As permissões efetivas da sessão — união dos grupos (D76).
     *
     * `undefined` em rota pública, onde não há sessão: ali não há permissão, e
     * isso é a verdade, não uma falha. O `preHandler` de permissão nem chega
     * nessas rotas (elas estão na allowlist), e quem ler isto fora de uma rota
     * autenticada tem que tratar o `undefined` — por isso ele está no tipo.
     */
    permissions?: ReadonlySet<Permissao>;
  }
}
