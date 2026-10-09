import type { Papel } from './helpers/papel';

// `request.papel` ganha tipo de verdade em todo o backend.
//
// ═══════════════════════════════════════════════════════════════════════════
// POR QUE NÃO DENTRO DE `request.user` — o D136 valia pela matriz, e o
// argumento MUDOU com o D148.
//
// O D136 tinha duas razões para manter a permissão fora do `SessionUser`:
// (1) a allowlist de `user-select.helper.ts` responde "o que é público de um
// usuário", não "o que ele pode fazer"; e (2) o `USER_PUBLIC_SELECT` viaja
// embutido em toda posse, ocupação e `assignedTo` do inventário — o JSON de
// permissões de cada grupo iria em cada linha de histórico de todo ativo.
//
// A segunda razão caiu: `papel` é UMA string de oito caracteres, não um
// conjunto de chaves. Carregá-la no select embutido custaria nada.
//
// A PRIMEIRA NÃO CAIU, e é por ela que o campo continua irmão: a allowlist de
// saída não deve passar a responder sobre autorização. Quem lê o próprio acesso
// pede `GET /api/auth/me`, que devolve o papel de propósito.
// ═══════════════════════════════════════════════════════════════════════════

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
