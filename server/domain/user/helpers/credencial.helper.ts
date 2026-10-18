import { AppError } from '../../../core/errors/app-error';
import { hashSenha } from '../../auth/helpers/password.helper';

// A SENHA NO CADASTRO DE USUÁRIO — a regra de quem precisa de uma.
//
// Técnico e Administrador operam o painel e entram com o e-mail e a senha;
// `USUARIO` só RECEBE equipamento e o login o recusa de qualquer jeito
// (`login.usecase.ts`). Então a senha é obrigatória para os dois cargos que
// entram, e dispensável para o terceiro — a tela nem mostra o campo para ele.

type Cargo = 'USUARIO' | 'TECNICO' | 'ADMIN';

const SENHA_OBRIGATORIA =
  'Técnico e Administrador entram no sistema com o e-mail e uma senha: defina a senha desta pessoa.';

/** O cargo entra no painel — e por isso precisa de senha? */
export function cargoEntraNoSistema(cargo: Cargo): boolean {
  return cargo === 'TECNICO' || cargo === 'ADMIN';
}

/** 422 quando o cargo entra no sistema e a pessoa ficaria sem senha. */
export function assertTemSenha(cargo: Cargo, temSenha: boolean): void {
  if (cargoEntraNoSistema(cargo) && !temSenha) throw new AppError(SENHA_OBRIGATORIA, 422);
}

/**
 * O hash, calculado FORA da transação de quem chama: argon2 leva ~50 ms, e
 * segurar uma conexão do pool durante o cálculo é transformar cadastro em fila
 * de banco.
 */
export async function hashSeHouver(senha: string | undefined): Promise<string | undefined> {
  return senha === undefined ? undefined : hashSenha(senha);
}
