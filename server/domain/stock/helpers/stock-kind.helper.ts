import type { $Enums } from '@prisma/client';
import type { prisma } from '../../../core/database/prismaClient';
import {
  ACCESSORY_SELECT, COMPONENT_SELECT, CONSUMABLE_SELECT,
} from './stock-select.helper';

// OS TRÊS TIPOS DE ESTOQUE, DECLARADOS — o que varia entre eles, num lugar só.
//
// POR QUE UM DOMÍNIO E NÃO TRÊS FATIAS VERTICAIS (D35): acessório, consumível e
// componente compartilham UMA invariante — saldo derivado mais trava na
// linha-pai (D34) — e UMA tela. Três fatias copiariam a invariante três vezes, e
// invariante copiada é invariante que um dia diverge. O que difere entre eles são
// as OPERAÇÕES (entregar × consumir × instalar), e operação já é um arquivo por
// vez em `use-cases/`.
//
// POR QUE NÃO O MOTOR DO CATÁLOGO: a coluna principal da listagem daqui é
// DERIVADA (`disponivel`), e o `select` da `CatalogSpec` é allowlist estática.
// Ensiná-lo a calcular saldo seria dobrar um genérico para atender três
// clientes — abstração que passa a custar mais do que economiza.
//
// O que este arquivo é, então: a mesma ideia da spec do catálogo, mas LOCAL e
// pequena. Três constantes, nenhuma rota escrita à mão em triplicata.

/**
 * Cliente aceito pelas operações: tanto o global quanto o de transação.
 *
 * `Omit<…, '$'>` tira os métodos de sessão (`$transaction`, `$connect`…) que o
 * cliente de transação não tem — é o que faz o MESMO código servir os dois.
 * Mesmo padrão do `ClienteCatalogo` e do `ClientePosse`.
 */
export type ClienteEstoque = Omit<typeof prisma, `$${string}`>;

/**
 * Os três, como lista e como tipo.
 *
 * O valor é o mesmo do `StockItemType` do banco (Etapa D): o `StockLog` grava
 * `itemType` a partir daqui, sem tradução no meio.
 */
export const STOCK_KINDS = ['ACCESSORY', 'CONSUMABLE', 'COMPONENT'] as const;
export type StockKind = (typeof STOCK_KINDS)[number];

/**
 * O mínimo que o CRUD genérico usa de um delegate do Prisma.
 *
 * POR QUE NÃO O TIPO REAL: a união dos três delegates não existe em TS — cada um
 * tem `where`/`data`/`select` próprios e a interseção deles não aceita nada.
 * Cada spec faz UM cast, ao lado do nome do model, e o cast morre ali.
 *
 * O que o cast NÃO atravessa: a entrada continua validada pelo `strictObject` do
 * schema, a saída continua limitada pelo `select` da spec, e TODA consulta de
 * saldo (`stock-balance.helper.ts`) continua totalmente tipada, porque ela fala
 * com as tabelas de movimento, não com estas.
 */
export interface StockDelegate {
  findMany(args: unknown): Promise<Record<string, unknown>[]>;
  count(args: unknown): Promise<number>;
  findFirst(args: unknown): Promise<Record<string, unknown> | null>;
  create(args: unknown): Promise<Record<string, unknown>>;
  update(args: unknown): Promise<Record<string, unknown>>;
  updateMany(args: unknown): Promise<{ count: number }>;
}

export interface StockKindSpec {
  kind: StockKind;
  /** Vira a rota: 'accessories' → /api/accessories */
  slug: string;
  /** Nome em português, para a mensagem de erro. */
  rotulo: string;
  /** Vira o `entityType` do ActivityLog: 'Accessory'. */
  entityType: string;
  /**
   * A categoria precisa ser DESTE tipo. Nada no banco impede um `Accessory`
   * apontar para uma `Category` de `type = ASSET`: a guarda é do use-case, e o
   * `optionFilter` da spec de categoria protege a tela.
   */
  categoryType: $Enums.CategoryType;
  /**
   * O nome da TABELA, para o `SELECT … FOR UPDATE` da trava (D34).
   *
   * Literal, e nunca montado a partir de entrada do cliente: quem resolve o
   * `kind` é o controller, a partir da rota que o maestro registrou.
   */
  tabela: 'accessories' | 'consumables' | 'components';
  delegate: (client: ClienteEstoque) => StockDelegate;
  /** Allowlist de resposta. */
  select: Record<string, unknown>;
  /** Allowlist de ordenação, exigida pelo core/http/list-query.ts. */
  sortable: readonly [string, ...string[]];
  /** Campos varridos pela busca `?q=`. */
  searchable: readonly string[];
  /** Campos que entram no diff do ActivityLog. */
  audited: readonly string[];
}

// Ordenáveis e auditados são os MESMOS nos três — a diferença de colunas entre
// eles é uma só (`serial`, do componente), e ela entra por espalhamento abaixo.
//
// `qty` é ordenável e auditado DE PROPÓSITO, mesmo não sendo editável pelo
// formulário: quem a muda é `adjust-quantity`, que grava `StockLog` E
// `ActivityLog` — o histórico do item precisa mostrar as duas coisas.
const SORTABLE_COMUM = ['name', 'qty', 'createdAt'] as const;
const SEARCHABLE_COMUM = ['name', 'modelNumber', 'orderNumber'] as const;
const AUDITED_COMUM = [
  'name', 'qty', 'minQty', 'modelNumber', 'categoryId', 'manufacturerId',
  'supplierId', 'locationId', 'orderNumber', 'purchaseDate', 'purchaseCost', 'notes',
] as const;

export const accessorySpec: StockKindSpec = {
  kind: 'ACCESSORY',
  slug: 'accessories',
  rotulo: 'acessório',
  entityType: 'Accessory',
  categoryType: 'ACCESSORY',
  tabela: 'accessories',
  delegate: (client) => client.accessory as unknown as StockDelegate,
  select: ACCESSORY_SELECT,
  sortable: SORTABLE_COMUM,
  searchable: SEARCHABLE_COMUM,
  audited: AUDITED_COMUM,
};

export const consumableSpec: StockKindSpec = {
  kind: 'CONSUMABLE',
  slug: 'consumables',
  rotulo: 'consumível',
  entityType: 'Consumable',
  categoryType: 'CONSUMABLE',
  tabela: 'consumables',
  delegate: (client) => client.consumable as unknown as StockDelegate,
  select: CONSUMABLE_SELECT,
  sortable: SORTABLE_COMUM,
  searchable: SEARCHABLE_COMUM,
  audited: AUDITED_COMUM,
};

export const componentSpec: StockKindSpec = {
  kind: 'COMPONENT',
  slug: 'components',
  rotulo: 'componente',
  entityType: 'Component',
  categoryType: 'COMPONENT',
  tabela: 'components',
  delegate: (client) => client.component as unknown as StockDelegate,
  select: COMPONENT_SELECT,
  sortable: [...SORTABLE_COMUM, 'serial'],
  searchable: [...SEARCHABLE_COMUM, 'serial'],
  audited: [...AUDITED_COMUM, 'serial'],
};

/** Os três indexados pelo `kind` — é por aqui que o `/api/stock/alerts` itera. */
export const SPEC_POR_KIND: Record<StockKind, StockKindSpec> = {
  ACCESSORY: accessorySpec,
  CONSUMABLE: consumableSpec,
  COMPONENT: componentSpec,
};
