// O CARGO DA SESSÃO — dois valores, com ordem (D148).
//
// ═══════════════════════════════════════════════════════════════════════════
// POR QUE COM ORDEM, E NÃO DOIS VALORES SOLTOS: a pergunta de toda rota é "tem
// ao MENOS este cargo?". Sem ordem, cada linha do mapa teria que listar os
// cargos aceitos (`['ADMIN', 'TECNICO']`) e a lista cresceria errada — alguém
// acrescentaria `ADMIN` em rota nova e esqueceria em outra. Com ordem, a linha
// declara o MÍNIMO e o resto é aritmética.
//
// POR QUE NÃO UM BOOLEANO `isAdmin`: com dois cargos ele caberia, e o enum
// custa o mesmo. A linha do mapa continua dizendo QUAL cargo, e não "precisa
// de admin?" — o terceiro cargo, se um dia vier, entra no array e não reescreve
// rota nenhuma.
//
// Quem RECEBE equipamento não tem cargo: é colaborador (`Person`), outra
// tabela, e não entra no sistema.
// ═══════════════════════════════════════════════════════════════════════════

/** Os dois cargos, do menor para o maior. A ordem do array **é** a hierarquia. */
export const CARGOS = ['TECNICO', 'ADMIN'] as const;

export type Cargo = (typeof CARGOS)[number];

/** O nome que aparece na tela e na mensagem de 403. */
export const NOME_DO_CARGO: Readonly<Record<Cargo, string>> = {
  TECNICO: 'Técnico',
  ADMIN: 'Administrador',
};

/**
 * `true` quando `cargo` é conhecido.
 *
 * Usado na borda: o que vem do mapa de rotas é escrito à mão e chega pelo
 * `permission-guard` como `string` — o core não conhece `Cargo`.
 */
export function ehCargo(valor: unknown): valor is Cargo {
  return typeof valor === 'string' && (CARGOS as readonly string[]).includes(valor);
}

/**
 * `cargo` alcança `minimo`?
 *
 * `ADMIN` alcança tudo; `TECNICO`, só o que exige `TECNICO`. É a única
 * função que conhece a hierarquia — quem precisa comparar cargo chama esta, e
 * não o `indexOf` por fora.
 */
export function cargoAlcanca(cargo: Cargo, minimo: Cargo): boolean {
  return CARGOS.indexOf(cargo) >= CARGOS.indexOf(minimo);
}
