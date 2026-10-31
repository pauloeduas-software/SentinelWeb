import type { User } from './user.types';

/**
 * Quem está logado.
 *
 * Os campos de `User` vêm da mesma allowlist de toda rota que devolve usuário
 * (`USER_PUBLIC_SELECT`) — o login não tem uma própria, senão é por ela que o
 * `passwordHash` escapa um dia. O que a sessão tem A MAIS é `role`, e a diferença
 * é deliberada: no servidor ele fica FORA daquela allowlist, porque o que a
 * pessoa PODE não é dado dela.
 *
 * Então "a sessão" e "um colaborador da listagem" não têm os mesmos campos, e é
 * esse o motivo de os dois tipos existirem separados.
 *
 * O que NÃO existe aqui, e nunca vai existir: token. Ele viaja em cookie
 * httpOnly e o JavaScript do painel nunca o vê (docs/historico/fase-03-autenticacao-e-ator.md, D22).
 */
export type SessionUser = Omit<User, 'role' | 'isActive'> & {
  /**
   * O CARGO desta pessoa (D148) — hoje sempre `ADMIN` (Z).
   *
   * Na sessão VEM SÓ DE DUAS ROTAS, `POST /api/auth/login` e `GET /api/auth/me`:
   * no servidor ele não está no `USER_PUBLIC_SELECT` de propósito, e sai na
   * mesma consulta que relê a sessão.
   *
   * PARA QUE A TELA USA: para não desenhar o que vai dar 403. Isto **não é
   * segurança** — a segurança é o `preHandler` do servidor, que recusa antes de
   * qualquer tela existir. Esconder um menu não protege dado nenhum, e é por isso
   * que a decisão não pode existir só aqui.
   *
   * ERA UM ARRAY de chaves `<módulo>.<ação>`, a união dos grupos (D76). Virou uma
   * string com ordem, e quem compara é o `usePode()` do store.
   */
  role: 'ADMIN';
  /**
   * A conta entrou com uma senha temporária e ainda não a trocou (AR): o painel
   * mostra só a tela de troca, e o servidor recusa o resto com 403.
   */
  mustChangePassword: boolean;
};

/** O login é o e-mail do cadastro, e a senha. */
export interface Credenciais {
  email: string;
  password: string;
}
