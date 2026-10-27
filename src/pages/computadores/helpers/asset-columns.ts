// O CATÁLOGO DE COLUNAS DA LISTAGEM DE ATIVOS — o que o seletor de colunas
// oferece.
//
// Só a TELA conhece este catálogo: qual é o rótulo de cada coluna, quais nascem
// visíveis e qual nunca pode ser escondida. O servidor não sabe de coluna
// nenhuma — a listagem devolve sempre o mesmo `ASSET_SELECT`, e escolher o que
// mostrar é decisão de quem olha, guardada no navegador (`asset.store.ts`).

export interface ColunaDeAtivo {
  /** A chave da coluna — é o que a preferência salva guarda. */
  token: string;
  rotulo: string;
  /**
   * Nasce marcada. São as sete que a tela já mostrava antes de existir seletor
   * — quem nunca abrir o menu não vê diferença nenhuma.
   */
  padrao: boolean;
  /**
   * Não pode ser desmarcada.
   *
   * Só a etiqueta: ela é o que identifica a linha, e é nela que mora o clique
   * que abre o ativo. Uma tabela de ativos sem etiqueta é uma lista de coisas
   * sem nome, e o jeito de voltar atrás seria adivinhar qual linha é qual.
   */
  fixa?: boolean;
}

export const COLUNAS_DE_ATIVO: readonly ColunaDeAtivo[] = [
  // A célula da etiqueta mostra a SÉRIE embaixo.
  { token: 'assetTag', rotulo: 'Etiqueta', padrao: true, fixa: true },
  // A célula do modelo mostra o FABRICANTE embaixo.
  { token: 'model', rotulo: 'Modelo', padrao: true },
  { token: 'category', rotulo: 'Categoria', padrao: true },
  { token: 'status', rotulo: 'Status', padrao: true },
  { token: 'location', rotulo: 'Localização', padrao: true },
  { token: 'responsible', rotulo: 'Responsável', padrao: true },
  // Custo e data da compra juntos, numa célula só.
  { token: 'purchase', rotulo: 'Compra', padrao: true },

  // As que a tela não mostrava, e que o payload da listagem JÁ TRAZ. Nenhuma
  // delas custa uma consulta a mais: o `ASSET_SELECT` do servidor é o mesmo.
  { token: 'name', rotulo: 'Nome', padrao: false },
  { token: 'orderNumber', rotulo: 'Nº do pedido', padrao: false },
];

/** O conjunto que a preferência vazia significa. */
export const COLUNAS_PADRAO: string[] = COLUNAS_DE_ATIVO
  .filter((coluna) => coluna.padrao)
  .map((coluna) => coluna.token);

/** As que não podem ser desmarcadas — a preferência salva sempre as contém. */
export const COLUNAS_FIXAS: string[] = COLUNAS_DE_ATIVO
  .filter((coluna) => coluna.fixa)
  .map((coluna) => coluna.token);

/**
 * A preferência salva, CRUZADA com o catálogo de hoje.
 *
 * A preferência mora no navegador de quem a escolheu (`asset.store.ts`, com
 * `persist`), então ela sobrevive a um deploy que renomeie ou apague uma coluna.
 * Sem este cruzamento, um token morto na preferência de alguém viraria uma
 * coluna que o cabeçalho não desenha — e, pior, a FIXA poderia faltar numa
 * preferência gravada por uma versão antiga.
 */
export function colunasVisiveis(preferencia: readonly string[]): string[] {
  const escolhidas = new Set([...preferencia, ...COLUNAS_FIXAS]);
  return COLUNAS_DE_ATIVO.filter((coluna) => escolhidas.has(coluna.token)).map((c) => c.token);
}
