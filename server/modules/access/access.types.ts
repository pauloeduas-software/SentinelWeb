import type { Cargo } from './helpers/cargo';

// `request.cargo` ganha tipo de verdade em todo o backend.
//
// POR QUE NÃO DENTRO DE `request.user`: a allowlist de `user-select.helper.ts`
// responde "o que é público de um usuário", não "o que ele pode fazer". Quem lê
// o próprio acesso pede `GET /api/auth/me`, que devolve o cargo de propósito.

declare module 'fastify' {
  interface FastifyRequest {
    /**
     * O cargo da sessão (D148).
     *
     * `undefined` em rota pública, onde não há sessão: ali não há cargo, e isso
     * é a verdade, não uma falha. O `preHandler` de permissão nem chega nessas
     * rotas (elas estão na allowlist), e quem ler isto fora de uma rota
     * autenticada tem que tratar o `undefined` — por isso ele está no tipo.
     */
    cargo?: Cargo;
    /**
     * A conta entrou com uma senha temporária e ainda não a trocou (AR). Só
     * `/api/auth/me` e Minha conta o leem: é como o painel descobre que deve
     * mostrar a troca.
     */
    deveTrocarSenha?: boolean;
  }
}
