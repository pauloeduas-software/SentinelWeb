import type { User } from './user.types';

/**
 * Quem está logado.
 *
 * É o MESMO formato de `User` porque o servidor devolve a sessão pela mesma
 * allowlist de toda rota que devolve usuário (`USER_PUBLIC_SELECT`). O apelido
 * existe para a tela dizer o que quer dizer — "o usuário da sessão" não é "um
 * colaborador da listagem", ainda que hoje tenham os mesmos campos.
 *
 * O que NÃO existe aqui, e nunca vai existir: token. Ele viaja em cookie
 * httpOnly e o JavaScript do painel nunca o vê (docs/FASE-3-PLANO-ITAM.md, D22).
 */
export type SessionUser = User;

export interface Credenciais {
  username: string;
  password: string;
}

/**
 * Um token de agente, como a listagem o devolve.
 *
 * Sem `token` e sem `tokenHash`: o segredo aparece UMA vez, na resposta da
 * emissão, e nunca mais. Não há rota para relê-lo, e é essa ausência que faz o
 * sha256 no banco valer alguma coisa — nem quem lê o dump consegue autenticar.
 */
export interface TokenDeAgente {
  id: string;
  name: string;
  ownerType: 'AGENT' | 'USER';
  /** Preenchido no PRIMEIRO handshake, não na emissão (D80). */
  endpointId: string | null;
  /** A metade pública. Identifica a linha na tela sem revelar nada. */
  prefix: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  createdById: string | null;
}

/** A resposta da EMISSÃO — a única que carrega o segredo. */
export interface TokenEmitido extends TokenDeAgente {
  token: string;
}
