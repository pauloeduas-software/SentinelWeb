import type { ZodType } from 'zod';
import type { prisma } from '../../../core/database/prismaClient';

// O contrato de UMA tabela de catálogo. Sete arquivos preenchem isto e o CRUD
// genérico (use-cases/) atende às sete — em vez de sete fatias verticais quase
// idênticas, que é o que o docs/ARQUITETURA.md chama de cerimônia.

/**
 * Cliente do Prisma aceito pelo CRUD: tanto o global quanto o de transação.
 *
 * `Omit<…, '$'>` tira os métodos de sessão (`$transaction`, `$connect`…) que o
 * cliente de transação não tem — é o que faz o MESMO código servir os dois.
 */
export type ClienteCatalogo = Omit<typeof prisma, `$${string}`>;

/**
 * O mínimo que o CRUD usa de um delegate do Prisma.
 *
 * POR QUE NÃO O TIPO REAL: a união dos sete delegates não existe em TS — cada um
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
  /** Vira o `entityType` do ActivityLog: 'Category' */
  entityType: string;
  /** Nome em português, para a mensagem de erro do 409 */
  rotulo: string;

  delegate: (client: ClienteCatalogo) => CatalogDelegate;

  createSchema: ZodType;
  updateSchema: ZodType;

  /**
   * Allowlist de resposta. Precisa conter todo campo de `audited`, senão o diff
   * do ActivityLog compara contra `undefined` e marca como alterado o que não foi.
   * Aceita `select` aninhado (`{ manufacturer: { select: { id: true, name: true } } }`).
   */
  select: Record<string, unknown>;
  /** Allowlist de ordenação, exigida pelo core/http/list-query.ts */
  sortable: readonly [string, ...string[]];
  defaultSort: string;
  /** Campos varridos pela busca `?q=` */
  searchable: readonly string[];
  /** Campos que entram no diff do ActivityLog */
  audited: readonly string[];

  /**
   * Filtro que o `/options` aceita, como ALLOWLIST de campo e de valores.
   *
   * Existe porque `/categories/options` devolvia dois "Notebook" — o de ATIVO e
   * o de LICENÇA — indistinguíveis num `<select>`. E o formulário de ativo
   * precisa só das categorias de ATIVO.
   *
   * O campo e os valores são declarados aqui, nunca lidos crus do cliente: é a
   * mesma regra do `sortable`.
   */
  optionFilter?: { campo: string; valores: readonly [string, ...string[]] };

  /**
   * Quantos registros apontam para esta linha. > 0 recusa o DELETE com 409 —
   * é o que o Snipe-IT faz ao se recusar a apagar categoria com item associado.
   * Ainda devolve 0 onde a tabela que aponta só nasce numa fase adiante.
   */
  countUsages: (client: ClienteCatalogo, id: string) => Promise<number>;

  /** Regra que roda antes de gravar. `id` é null na criação. */
  beforeWrite?: (
    client: ClienteCatalogo,
    id: string | null,
    data: Record<string, unknown>,
  ) => Promise<void>;
}
