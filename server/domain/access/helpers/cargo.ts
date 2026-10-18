// O CARGO DA SESSÃO — três valores, com ordem (D148).
//
// ═══════════════════════════════════════════════════════════════════════════
// POR QUE COM ORDEM, E NÃO TRÊS VALORES SOLTOS: a pergunta de toda rota é "tem
// ao MENOS este cargo?". Sem ordem, cada linha do mapa teria que listar os
// cargos aceitos (`['ADMIN', 'TECNICO']`) e a lista cresceria errada — alguém
// acrescentaria `ADMIN` em rota nova e esqueceria em outra. Com ordem, a linha
// declara o MÍNIMO e o resto é aritmética.
//
// POR QUE NÃO UM BOOLEANO `isAdmin`: porque três é o número de cargos que o
// problema tem. O técnico mexe no inventário e não mexe em gente nem em
// configuração. Com booleano, "mexer no inventário" e "criar usuário" seriam a
// mesma coisa.
//
// `USUARIO` é o colaborador que RECEBE equipamento, e não um operador: ele é
// alvo de posse, e o login o recusa com 403 (`login.usecase.ts`). O cargo está
// na hierarquia porque é o piso dela — nenhuma rota exige `USUARIO`, e é isso
// que a aritmética do `cargoAlcanca` diz.
// ═══════════════════════════════════════════════════════════════════════════

/** Os três cargos, do menor para o maior. A ordem do array **é** a hierarquia. */
export const CARGOS = ['USUARIO', 'TECNICO', 'ADMIN'] as const;

export type Cargo = (typeof CARGOS)[number];

/** O nome que aparece na tela e na mensagem de 403. */
export const NOME_DO_CARGO: Readonly<Record<Cargo, string>> = {
  USUARIO: 'Usuário',
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
 * `ADMIN` alcança tudo; `USUARIO` só o que não exige nada acima dele. É a única
 * função que conhece a hierarquia — quem precisa comparar cargo chama esta, e
 * não o `indexOf` por fora.
 */
export function cargoAlcanca(cargo: Cargo, minimo: Cargo): boolean {
  return CARGOS.indexOf(cargo) >= CARGOS.indexOf(minimo);
}
