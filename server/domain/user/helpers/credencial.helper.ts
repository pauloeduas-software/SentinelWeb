import { hashSenha } from '../../auth/helpers/password.helper';

// A SENHA NA EDIÇÃO DE USUÁRIO — "Nova senha": ausente mantém a atual.

/**
 * O hash, calculado FORA da transação de quem chama: argon2 leva ~50 ms, e
 * segurar uma conexão do pool durante o cálculo é transformar cadastro em fila
 * de banco.
 */
export async function hashSeHouver(senha: string | undefined): Promise<string | undefined> {
  return senha === undefined ? undefined : hashSenha(senha);
}
