// CASAR A CONTA DO WINDOWS COM UMA PESSOA DO CADASTRO — função pura.
//
// `DOMINIO\ana.silva` já chegou aqui como `ana.silva` (o `normalizeUserKey`).
// O que falta é a pergunta difícil: QUEM é ana.silva?
//
// ─────────────────────────────────────────────────────────────────────────────
// O PLANO DA FASE DIZIA "até a F3/F11 darem `username` ao `User`, isto é sempre
// sugestão". A F3 JÁ DEU: `User.username` existe, nulável, com unicidade por
// índice PARCIAL (`WHERE deleted_at IS NULL`). Então a cascata tem dois sinais,
// não um — e o primeiro deles é exato por construção do banco.
//
// Continua sendo sempre sugestão, mas por outro motivo: casar conta de sistema
// com pessoa é uma afirmação sobre gente, e o preço do erro é atribuir a posse
// de um equipamento a quem não o tem.
// ─────────────────────────────────────────────────────────────────────────────

export interface PessoaCandidata {
  id: string;
  name: string;
  email: string;
  username: string | null;
}

export type SinalDePessoa = 'USERNAME' | 'EMAIL';

export interface CasamentoDePessoa {
  userId: string;
  sinal: SinalDePessoa;
  score: number;
}

export const PONTOS_DE_PESSOA: Record<SinalDePessoa, number> = {
  /** Unicidade garantida pelo índice parcial da F3: um só entre os vivos. */
  USERNAME: 100,
  /**
   * A parte local do e-mail. 85 e não 100 porque ela NÃO é única por
   * construção: `ana@empresa.com` e `ana@terceirizada.com` são duas pessoas com
   * a mesma parte local, e o sistema não tem como saber qual delas logou.
   */
  EMAIL: 85,
};

function parteLocal(email: string): string {
  return email.split('@')[0].trim().toLowerCase();
}

/**
 * Quem é esta conta — ou `null`, que é uma resposta legítima e comum.
 *
 * **AMBÍGUO PONTUA ZERO**, o D46 aplicado a gente: se duas pessoas casam pela
 * mesma chave, o que existe não é uma dúvida entre duas — é a certeza de que o
 * sinal não identifica ninguém. Escolher "a primeira" aqui atribuiria o
 * notebook da Ana Silva à Ana Souza, e o operador aceitaria a sugestão porque o
 * sistema a apresentou como certa.
 *
 * A cascata para no primeiro sinal que casa sem ambiguidade — e um sinal
 * ambíguo NÃO cai para o próximo: se duas pessoas têm o mesmo `username`
 * (possível entre vivos e lixeira), a resposta é "não sei", não "então vou
 * tentar pelo e-mail".
 */
export function casarPessoa(userKey: string, candidatos: PessoaCandidata[]): CasamentoDePessoa | null {
  const chave = userKey.trim().toLowerCase();
  if (!chave) return null;

  const porUsername = candidatos.filter((pessoa) => pessoa.username?.trim().toLowerCase() === chave);
  if (porUsername.length === 1) {
    return { userId: porUsername[0].id, sinal: 'USERNAME', score: PONTOS_DE_PESSOA.USERNAME };
  }
  if (porUsername.length > 1) return null;

  const porEmail = candidatos.filter((pessoa) => parteLocal(pessoa.email) === chave);
  if (porEmail.length === 1) {
    return { userId: porEmail[0].id, sinal: 'EMAIL', score: PONTOS_DE_PESSOA.EMAIL };
  }

  return null;
}
