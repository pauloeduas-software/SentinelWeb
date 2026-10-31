import type { ZodType } from 'zod';
import type { prisma } from '../../../infra/database/prismaClient';
import type { ReferenciaDoErro } from '../../../infra/errors/app-error';

// O contrato de UMA tabela de catálogo. Cinco arquivos preenchem isto e o CRUD
// genérico (use-cases/) atende às cinco — em vez de cinco fatias verticais quase
// idênticas, que é o que o docs/referencia/arquitetura.md chama de cerimônia.

/**
 * Cliente do Prisma aceito pelo CRUD: tanto o global quanto o de transação.
 *
 * A lista de exclusão é a do PRÓPRIO Prisma (`ITXClientDenyList`): são os seis
 * métodos de SESSÃO que o cliente de transação não tem. Escrita à mão porque o
 * tipo não é exportado publicamente no 5.x.
 *
 * ⚠️ Ela era `Omit<…, `$${string}`>`, que tirava TODOS os métodos com `$` —
 * inclusive `$queryRaw`. As specs precisam dele: as travas de linha que elas
 * chamam com este cliente (`catalog-lock.helper.ts`) são `FOR UPDATE`/`FOR
 * SHARE`, que só se escrevem em SQL. Tirar `$queryRaw` do tipo empurraria a
 * trava para FORA da transação da escrita — que é justamente onde ela não
 * pode estar.
 */
export type ClienteCatalogo = Omit<
  typeof prisma,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

/**
 * O mínimo que o CRUD usa de um delegate do Prisma.
 *
 * POR QUE NÃO O TIPO REAL: a união dos cinco delegates não existe em TS — cada um
 * tem `where`/`data`/`select` próprios e a interseção deles não aceita nada.
 * Cada spec faz UM cast, ao lado do nome do model, e o cast morre ali.
 *
 * O que o cast NÃO atravessa: a entrada continua validada pelo `strictObject` do
 * schema, a saída continua limitada pelo `select` da spec, e o `countUsages` de
 * cada spec continua totalmente tipado.
 */
export interface CatalogDelegate {
  findMany(args: unknown): Promise<Record<string, unknown>[]>;
  count(args: unknown): Promise<number>;
  findFirst(args: unknown): Promise<Record<string, unknown> | null>;
  create(args: unknown): Promise<Record<string, unknown>>;
  update(args: unknown): Promise<Record<string, unknown>>;
  delete(args: unknown): Promise<Record<string, unknown>>;
}

export interface CatalogSpec {
  /** Vira a rota: 'categories' → /api/categories */
  slug: string;
  /** Vira o `entityType` do AuditLog: 'Category' */
  entityType: string;
  /** A tabela no banco, para a trava da edição (`update-catalog.usecase.ts`). */
  tabela: string;
  /** Nome em português, para a mensagem de erro do 409 */
  rotulo: string;

  delegate: (client: ClienteCatalogo) => CatalogDelegate;

  createSchema: ZodType;
  updateSchema: ZodType;

  /**
   * Allowlist de resposta. Precisa conter todo campo de `audited`, senão o diff
   * do AuditLog compara contra `undefined` e marca como alterado o que não foi.
   * Aceita `select` aninhado (`{ manufacturer: { select: { id: true, name: true } } }`).
   */
  select: Record<string, unknown>;
  /** Campos varridos pela busca `?q=` */
  searchable: readonly string[];
  /** Campos que entram no diff do AuditLog */
  audited: readonly string[];

  /**
   * Filtro que o `/options` e a listagem aceitam, como ALLOWLIST de campo e
   * de valores. Na listagem, é o que separa as categorias por tipo na tela de
   * Configurações.
   *
   * Existe porque `/categories/options` devolvia dois "Notebook" — o de ATIVO e
   * o de LICENÇA — indistinguíveis num `<select>`. E o formulário de ativo
   * precisa só das categorias de ATIVO.
   *
   * O campo e os valores são declarados aqui, nunca lidos crus do cliente.
   */
  optionFilter?: { campo: string; valores: readonly [string, ...string[]] };

  /**
   * Quantos registros apontam para esta linha. > 0 recusa o DELETE com 409 —
   * é o que o Snipe-IT faz ao se recusar a apagar categoria com item associado.
   * Ainda devolve 0 onde a tabela que aponta só nasce numa fase adiante.
   */
  countUsages: (client: ClienteCatalogo, id: string) => Promise<number>;

  /** Frase que completa o 409 do delete — o que fazer em vez de excluir. */
  dicaEmUso?: string;

  /**
   * A recusa da exclusão com frase PRÓPRIA, no lugar de "em uso por N
   * registros" + `dicaEmUso`. Devolve `null` quando pode excluir.
   *
   * Para a tabela em que o número não diz o que fazer: o colaborador que
   * "está em uso por 3 registros" pode estar com um ativo, uma licença e um
   * posto, e cada um se resolve numa tela diferente. Roda na transação da
   * exclusão, e pode travar a linha antes de contar.
   */
  motivoParaNaoExcluir?: (
    client: ClienteCatalogo,
    id: string,
  ) => Promise<{ mensagem: string; refs?: ReferenciaDoErro[] } | null>;

  /**
   * A tabela tem LIXEIRA: excluir grava `deletedAt` em vez de apagar, a
   * listagem aceita `?view=trashed` e existe `POST /:id/restore`.
   *
   * Só o colaborador — o único do catálogo com histórico de posse PRÓPRIO, que
   * recadastrar partiria em dois. O model precisa da coluna `deletedAt`, e é a
   * extension de soft delete que o esconde de toda leitura.
   */
  lixeira?: boolean;

  /** Regra que roda antes de RESTAURAR — a unicidade que a lixeira libera. */
  beforeRestore?: (client: ClienteCatalogo, id: string) => Promise<void>;

  /**
   * O nome é único SEM diferença de maiúscula, dentro destes campos.
   *
   * `[]` = único na tabela inteira; `['type']` = único por tipo (categoria).
   * Ausente = a tabela não tem nome único (modelo).
   *
   * O índice do banco compara byte a byte: "Dell" e "dell" passavam os dois e
   * apareciam duplicados em todo `<select>`. A checagem é da aplicação e vem
   * com a mensagem que diz QUAL nome colidiu; o `@unique` continua embaixo
   * como rede da colisão exata.
   */
  nomeUnicoPor?: readonly string[];

  /** Filtro fixo do `/options`: o que não pode ser ESCOLHIDO num formulário. */
  optionsWhere?: Record<string, unknown>;

  /**
   * A coluna que vai ao lado do nome no `/options`, como `detalhe` — o que
   * separa dois registros de mesmo nome num `<select>` (o e-mail do colaborador).
   */
  optionDetail?: string;

  /**
   * Regra que roda antes de EXCLUIR, depois da contagem de uso — para o que não
   * é uso mas também segura a linha (o último status ativo de um tipo).
   */
  beforeDelete?: (client: ClienteCatalogo, id: string) => Promise<void>;

  /** Regra que roda antes de gravar. `id` é null na criação. */
  beforeWrite?: (
    client: ClienteCatalogo,
    id: string | null,
    data: Record<string, unknown>,
  ) => Promise<void>;
}
