// O PAPEL DA SESSÃO — três valores, com ordem (D148).
//
// ═══════════════════════════════════════════════════════════════════════════
// POR QUE PAPEL, E NÃO A MATRIZ DE PERMISSÕES.
//
// A matriz (D76) era união permissiva de chaves nomeadas vindas de grupos:
// `assets.view`, `licenses.viewKey`, `reports.export`… 138 linhas de catálogo e
// um modelo `Group` para compor conjuntos. É a resposta certa para uma empresa
// que precisa dizer "este terceirizado vê ativo e não vê custo".
//
// Não é a resposta certa aqui: o sistema tem três contas e nenhuma delas
// exercita regra de ITAM. O que a matriz protegia — *esta rota exige mais que
// uma sessão* — um papel protege igual, e o que ela cobrava era 2.300 linhas.
//
// POR QUE COM ORDEM, E NÃO TRÊS VALORES SOLTOS: a pergunta de toda rota é "tem
// ao MENOS este papel?". Sem ordem, cada linha do mapa teria que listar os
// papéis aceitos (`['ADMIN', 'TECNICO']`) e a lista cresceria errada — alguém
// acrescentaria `ADMIN` em rota nova e esqueceria em outra. Com ordem, a linha
// declara o MÍNIMO e o resto é aritmética.
//
// POR QUE NÃO UM BOOLEANO `isAdmin`: porque três é o número de papéis que o
// problema tem. O técnico mexe no inventário e não mexe em gente nem em
// configuração; o usuário comum só se vê. Com booleano, "mexer no inventário"
// e "criar usuário" seriam a mesma coisa.
// ═══════════════════════════════════════════════════════════════════════════

/** Os três papéis, do menor para o maior. A ordem do array **é** a hierarquia. */
export const PAPEIS = ['USUARIO', 'TECNICO', 'ADMIN'] as const;

export type Papel = (typeof PAPEIS)[number];

/** O nome que aparece na tela e na mensagem de 403. */
export const NOME_DO_PAPEL: Readonly<Record<Papel, string>> = {
  USUARIO: 'Usuário',
  TECNICO: 'Técnico',
  ADMIN: 'Administrador',
};

/**
 * `true` quando `papel` é conhecido.
 *
 * Usado na borda: o que vem do banco é `String` para o Prisma até a migração do
 * enum, e o que vem do mapa de rotas é escrito à mão.
 */
export function ehPapel(valor: unknown): valor is Papel {
  return typeof valor === 'string' && (PAPEIS as readonly string[]).includes(valor);
}

/**
 * `papel` alcança `minimo`?
 *
 * `ADMIN` alcança tudo; `USUARIO` só o que não exige nada acima dele. É a única
 * função que conhece a hierarquia — quem precisa comparar papel chama esta, e
 * não o `indexOf` por fora.
 */
export function papelAlcanca(papel: Papel, minimo: Papel): boolean {
  return PAPEIS.indexOf(papel) >= PAPEIS.indexOf(minimo);
}
