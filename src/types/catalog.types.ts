/**
 * Linha de uma tabela de catálogo.
 *
 * Os campos variam por tabela — quem diz quais existem e como mostrá-los é a
 * spec de interface (src/pages/configuracoes/specs/ e src/pages/colaboradores/specs/). Tipar as seis linhas
 * separadamente aqui só duplicaria, em TypeScript, o que o servidor já garante
 * com o `select` de cada spec.
 */
export interface CatalogRow {
  id: string;
  name: string;
  /** A versão da linha: o Editar a devolve, e o servidor recusa se ela mudou (AF). */
  updatedAt: string;
  /** Quantos apontam para a linha: o número que recusaria o Excluir. Não vem do colaborador. */
  usos?: number;
  [campo: string]: unknown;
}

/** Item de seletor: o que `GET /api/<slug>/options` devolve. */
export interface CatalogOption {
  id: string;
  name: string;
  /** O que separa dois de mesmo nome — o e-mail do colaborador. Só onde a tabela declara. */
  detalhe?: string | null;
}
