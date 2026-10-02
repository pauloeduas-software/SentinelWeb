import { Prisma } from '@prisma/client';
import { AppError } from '../../../core/errors/app-error';
import { ATIVO_NO_PARQUE_SQL, ATIVO_VIVO_SQL } from '../../asset/helpers/asset-scope.helper';

// O MAPA TOKEN → FRAGMENTO SQL (F10, Etapa F — D67).
//
// ═════════════════════════════════════════════════════════════════════════════
// O CLIENTE MANDA TOKEN. O SERVIDOR TROCA POR UM FRAGMENTO DECLARADO EM CÓDIGO.
//
// O perigo nunca foi "raw SQL": é SQL CONTROLADO PELO CLIENTE. Um mapa de token
// para fragmento declarado é tão seguro quanto um mapa de token para campo do
// Prisma — e é o único que expressa o join da view, porque
// `vw_asset_responsibles` não existe no schema do Prisma e nenhum `select`
// tipado a alcança.
//
// É a MESMA forma do `sortable` de `core/http/list-query.ts`, que já resolveu
// isto para a ordenação, e do `ASSET_EXPORT_TOKENS`, que resolveu para o CSV.
//
// Token desconhecido é 422 COM A LISTA dos válidos. A mensagem é o que torna a
// divergência entre esta lista e a da tela barulhenta em vez de silenciosa.
//
// QUANDO A F11 CHEGAR, este mapa passa a ser FILTRADO POR PERMISSÃO — senão o
// report builder vira a porta dos fundos do custo de compra, que é dado
// sensível. O lugar da filtragem é aqui, numa linha, porque a lista está num
// lugar só.
// ═════════════════════════════════════════════════════════════════════════════

export interface ColunaDeRelatorio {
  /** O que vai no cabeçalho da tela e do CSV. */
  rotulo: string;
  /** A expressão SQL, sobre os apelidos que `BASE_DO_RELATORIO` declara. */
  expr: Prisma.Sql;
  /**
   * Pode ser usada em `agruparPor`.
   *
   * Dinheiro e data NÃO podem: agrupar por custo de compra produz uma linha por
   * centavo diferente, o que é uma listagem com outro nome. Quem quer somar
   * dinheiro usa a coluna como VALOR, com um agrupamento categórico ao lado.
   */
  agrupavel: boolean;
}

/**
 * OS APELIDOS, e eles são contrato: os fragmentos acima dependem deles.
 *
 * `r` é a view, em `LEFT JOIN`: um ativo no estoque não tem responsável, e um
 * `JOIN` simples o tiraria do relatório — justamente o equipamento que alguém
 * procura quando pergunta "o que está sem dono?".
 *
 * ⚠️ O `LEFT JOIN` COM A VIEW MULTIPLICA LINHAS, e isso é correto: um ativo
 * entregue a um posto com DUAS pessoas aparece duas vezes, uma por responsável.
 * É o que o modelo promete e é o que torna "o que cada pessoa responde"
 * respondível. Quem quer uma linha por ativo não pede coluna de responsável —
 * ou agrupa.
 */
const BASE_DO_RELATORIO = Prisma.sql`
  FROM assets a
  JOIN status_labels s ON s.id = a."statusId"
  JOIN asset_models m ON m.id = a."modelId"
  JOIN manufacturers f ON f.id = m."manufacturerId"
  JOIN categories c ON c.id = m."categoryId"
  LEFT JOIN locations l ON l.id = a."locationId"
  LEFT JOIN suppliers sup ON sup.id = a."supplierId"
  LEFT JOIN vw_asset_responsibles r ON r."assetId" = a.id
  LEFT JOIN users u ON u.id = r."userId"
  LEFT JOIN locations rl ON rl.id = r."locationId"
`;

const COLUNAS: Record<string, ColunaDeRelatorio> = {
  // ── O ATIVO ───────────────────────────────────────────────────────────────
  assetTag: { rotulo: 'Etiqueta', expr: Prisma.sql`a."assetTag"`, agrupavel: false },
  serial: { rotulo: 'Nº de série', expr: Prisma.sql`a.serial`, agrupavel: false },
  name: { rotulo: 'Nome', expr: Prisma.sql`a.name`, agrupavel: false },
  status: { rotulo: 'Status', expr: Prisma.sql`s.name`, agrupavel: true },
  model: { rotulo: 'Modelo', expr: Prisma.sql`m.name`, agrupavel: true },
  manufacturer: { rotulo: 'Fabricante', expr: Prisma.sql`f.name`, agrupavel: true },
  category: { rotulo: 'Categoria', expr: Prisma.sql`c.name`, agrupavel: true },
  location: { rotulo: 'Localização', expr: Prisma.sql`l.name`, agrupavel: true },
  supplier: { rotulo: 'Fornecedor', expr: Prisma.sql`sup.name`, agrupavel: true },

  purchaseDate: { rotulo: 'Data de compra', expr: Prisma.sql`a."purchaseDate"`, agrupavel: false },
  purchaseCost: { rotulo: 'Custo de compra', expr: Prisma.sql`a."purchaseCost"`, agrupavel: false },
  warrantyExpiresAt: { rotulo: 'Garantia até', expr: Prisma.sql`a."warrantyExpiresAt"`, agrupavel: false },
  eolDate: { rotulo: 'Fim de vida', expr: Prisma.sql`a."eolDate"`, agrupavel: false },

  // ── A CAMADA 3 — o que não é coluna de tabela nenhuma ─────────────────────
  //
  // É por estas quatro que este builder existe. Nenhum `select` do Prisma as
  // alcança: elas saem da view, que o Prisma não conhece.
  responsavel: {
    rotulo: 'Responsável',
    // `COALESCE` com a frase, e não `NULL`: um agrupamento por responsável com
    // `NULL` produz um balde sem rótulo na tela, e "(sem responsável)" é
    // exatamente o grupo que alguém abre o relatório para ver.
    expr: Prisma.sql`COALESCE(u.name, '(sem responsável)')`,
    agrupavel: true,
  },
  responsavelEmail: { rotulo: 'E-mail do responsável', expr: Prisma.sql`u.email`, agrupavel: false },
  via: {
    rotulo: 'Como responde',
    expr: Prisma.sql`COALESCE(r.via, 'SEM POSSE')`,
    agrupavel: true,
  },
  posto: { rotulo: 'Posto', expr: Prisma.sql`rl.name`, agrupavel: true },
  turno: { rotulo: 'Turno', expr: Prisma.sql`r.shift`, agrupavel: true },
};

export const REPORT_TOKENS = Object.keys(COLUNAS);
export const REPORT_TOKENS_AGRUPAVEIS = REPORT_TOKENS.filter((token) => COLUNAS[token].agrupavel);

/** O `WHERE` de todo relatório: fora da lixeira e dentro do parque. */
export const ESCOPO_DO_RELATORIO = Prisma.sql`WHERE ${ATIVO_VIVO_SQL} AND ${ATIVO_NO_PARQUE_SQL}`;

export function baseDoRelatorio() {
  return BASE_DO_RELATORIO;
}

/**
 * ⚠️ `Object.hasOwn`, e NUNCA `COLUNAS[token]` com um `if (!encontrada)`.
 *
 * `COLUNAS['constructor']` devolve a função `Object` — que é VERDADEIRA, então o
 * `if` não disparava e o token herdado atravessava a allowlist. Depois dele,
 * `.expr` era `undefined` e o `Prisma.sql` do builder quebrava com um 500, em
 * vez do 422 com a lista que o D67 promete. Vale para `'__proto__'`,
 * `'toString'`, `'valueOf'` e `'hasOwnProperty'`.
 */
export function coluna(token: string): ColunaDeRelatorio {
  const encontrada = Object.hasOwn(COLUNAS, token) ? COLUNAS[token] : undefined;
  if (!encontrada) {
    throw new AppError(
      `Coluna desconhecida: ${token}. Válidas: ${REPORT_TOKENS.join(', ')}.`,
      422,
      { validas: REPORT_TOKENS },
    );
  }
  return encontrada;
}

/**
 * Traduz os tokens pedidos em `SELECT`, com apelido.
 *
 * O APELIDO SAI DO MAPA, NÃO DA REQUISIÇÃO: `Prisma.raw` com texto do cliente
 * seria injeção, e a diferença aqui é sutil — o token chegou de fora, mas o que
 * é interpolado é a CHAVE do mapa que ele casou. Uma vez validado, ele é um
 * literal declarado em código.
 */
export function selectDasColunas(tokens: readonly string[]): Prisma.Sql {
  // `Object.hasOwn` pelo mesmo motivo do `coluna()` acima: com `in`, o
  // `'constructor'` passava daqui e o `find` logo abaixo devolvia `undefined`.
  const desconhecidas = tokens.filter((token) => !Object.hasOwn(COLUNAS, token));
  if (desconhecidas.length > 0) {
    throw new AppError(
      `Coluna desconhecida: ${desconhecidas.join(', ')}. Válidas: ${REPORT_TOKENS.join(', ')}.`,
      422,
      { validas: REPORT_TOKENS },
    );
  }

  const fragmentos = tokens.map((token) => {
    const declarado = REPORT_TOKENS.find((valido) => valido === token)!;
    return Prisma.sql`${COLUNAS[declarado].expr} AS ${Prisma.raw(`"${declarado}"`)}`;
  });

  return Prisma.join(fragmentos, ', ');
}

/**
 * Os tokens do builder que exigem permissão, e qual (F11, D77).
 *
 * ═════════════════════════════════════════════════════════════════════════
 * SEM ISTO, O BUILDER É A PORTA DOS FUNDOS DO CUSTO — e a mais larga das três.
 *
 * O export de ativos tem uma allowlist de colunas fixa; aqui a pessoa MONTA a
 * consulta, escolhendo colunas e agrupamento. Fechar a listagem e o CSV e
 * deixar o builder aberto é trocar um clique por três: *Montar relatório →
 * Custo de compra → Gerar*.
 *
 * O `custoDoAtivo` entra junto porque o `custom-report.usecase.ts` o seleciona
 * para SOMAR por grupo. Ele não é um token que a pessoa pede — é interno —, e
 * está aqui para o use-case consultar com a mesma lista, em vez de ter uma
 * regra própria que alguém esqueceria de atualizar.
 * ═════════════════════════════════════════════════════════════════════════
 */
export const TOKENS_COM_PERMISSAO: Readonly<Record<string, string>> = {
  purchaseCost: 'assets.viewCost',
};

/**
 * Os tokens que esta sessão pode pedir — é o que a tela usa para montar o
 * seletor.
 *
 * Filtrar a LISTA, e não só recusar o pedido, porque o seletor com uma opção
 * que sempre dá 403 é pior do que o seletor sem ela: a pessoa marca, gera,
 * recebe o erro e não sabe que o problema é aquela coluna.
 */
export function tokensPermitidos(pode: (permissao: string) => boolean): readonly string[] {
  return REPORT_TOKENS.filter(
    (token) => !TOKENS_COM_PERMISSAO[token] || pode(TOKENS_COM_PERMISSAO[token]),
  );
}

/**
 * Recusa os tokens que a sessão não alcança. **403**, e antes de montar o SQL.
 *
 * Chamada pelo use-case, e não embutida no `selectDasColunas`: aquela função é
 * usada também pelo agrupamento e pelo export, e cada chamador tem o seu
 * momento de ter a sessão em mão. Uma permissão lida lá dentro obrigaria a
 * passá-la por três caminhos que não precisam dela.
 */
export function assertColunasPermitidas(
  tokens: readonly string[],
  pode: (permissao: string) => boolean,
): void {
  const negadas = tokens.filter(
    (token) => TOKENS_COM_PERMISSAO[token] && !pode(TOKENS_COM_PERMISSAO[token]),
  );
  if (negadas.length === 0) return;

  throw new AppError(
    `Seu acesso não inclui a coluna: ${negadas.join(', ')}. Tire-a da seleção para gerar o relatório.`,
    403,
    { negadas },
  );
}

/** O token de agrupamento, conferido contra a lista do que PODE agrupar. */
export function colunaDeAgrupamento(token: string): ColunaDeRelatorio {
  const encontrada = coluna(token);

  if (!encontrada.agrupavel) {
    throw new AppError(
      `A coluna ${token} não pode agrupar — ela é um valor, não uma categoria. `
        + `Agrupáveis: ${REPORT_TOKENS_AGRUPAVEIS.join(', ')}.`,
      422,
      { agrupaveis: REPORT_TOKENS_AGRUPAVEIS },
    );
  }
  return encontrada;
}
