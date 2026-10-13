import type { Papel } from './helpers/papel';

// `request.papel` ganha tipo de verdade em todo o backend.
//
// POR QUE NÃO DENTRO DE `request.user`: a allowlist de `user-select.helper.ts`
// responde "o que é público de um usuário", não "o que ele pode fazer" — e ela
// viaja embutida em toda posse, ocupação e `assignedTo` do inventário. Misturar
// autorização ali faria a pergunta errada vazar para cada linha de histórico de
// todo ativo. Quem lê o próprio acesso pede `GET /api/auth/me`, que devolve o
// papel de propósito.

declare module 'fastify' {
  interface FastifyRequest {
    /**
     * O papel da sessão (D148).
     *
     * `undefined` em rota pública, onde não há sessão: ali não há papel, e isso
     * é a verdade, não uma falha. O `preHandler` de permissão nem chega nessas
     * rotas (elas estão na allowlist), e quem ler isto fora de uma rota
     * autenticada tem que tratar o `undefined` — por isso ele está no tipo.
     */
    papel?: Papel;
  }
}
