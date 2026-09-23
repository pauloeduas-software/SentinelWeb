/**
 * Linha de uma tabela de catálogo.
 *
 * Os campos variam por tabela — quem diz quais existem e como mostrá-los é a
 * spec de interface (src/pages/configuracoes/specs/). Tipar as sete linhas
 * separadamente aqui só duplicaria, em TypeScript, o que o servidor já garante
 * com o `select` de cada spec.
 */
export interface CatalogRow {
  id: string;
  name: string;
  [campo: string]: unknown;
}

/** Item de `<select>`: o que `GET /api/<slug>/options` devolve. */
export interface CatalogOption {
  id: string;
  name: string;
}
