import { z } from 'zod';

// Paginação, ordenação e busca de qualquer listagem — em um lugar só.
//
// REGRA DE CAMADA: a allowlist de colunas ordenáveis NÃO mora aqui. Saber que
// um item de inventário ordena por `name` e `category` é conhecimento de
// negócio, e `server/core` não pode importar `server/domain` (eslint.config.js).
// Por isso `parseListQuery` RECEBE a allowlist como parâmetro e cada domínio
// declara a sua. É a dependência invertida que a mensagem do lint pede.
//
// Ordenar por string crua do cliente é injeção: `orderBy` com um campo que o
// cliente escolheu vaza a existência de colunas e ordena por dado que a resposta
// nem devolve. A allowlist transforma `?sort=` em campo conhecido ou em 422.

const PER_PAGE_PADRAO = 25;
// Teto obrigatório: sem ele, `?perPage=999999` é uma negação de serviço de uma
// linha só — o Postgres monta a resposta inteira em memória.
const MAX_PER_PAGE_PADRAO = 100;
const MAX_BUSCA = 200;

/** Envelope de toda listagem. Mesmo formato do Snipe-IT. */
export interface ListEnvelope<T> {
  total: number;
  rows: T[];
}

export type ListView = 'active' | 'trashed';

export interface ListQuery<TSort extends string> {
  page: number;
  perPage: number;
  /** Prontos para o Prisma, para o use-case não recalcular. */
  skip: number;
  take: number;
  sort: TSort;
  order: 'asc' | 'desc';
  /** Termo de busca já limpo; `undefined` quando não veio nada. */
  q?: string;
  /** `trashed` lista a lixeira. Só existe quando o domínio declara `trashable`. */
  view: ListView;
}

export interface ListQueryOptions<TSort extends string> {
  /** Allowlist de colunas ordenáveis, declarada pelo domínio. */
  sortable: readonly [TSort, ...TSort[]];
  defaultSort: TSort;
  defaultOrder?: 'asc' | 'desc';
  perPage?: number;
  maxPerPage?: number;
  /**
   * O domínio tem lixeira (coluna `deletedAt`) e aceita `?view=trashed`.
   *
   * É opt-in em vez de sempre aceito: em `/api/assets`, que não tem soft delete,
   * um `?view=trashed` não faria nada — e aceitar em silêncio um parâmetro sem
   * efeito é o mesmo tipo de falha muda que o `strictObject` existe para evitar.
   */
  trashable?: boolean;
}

export function parseListQuery<TSort extends string>(
  raw: unknown,
  options: ListQueryOptions<TSort>,
): ListQuery<TSort> {
  const {
    sortable,
    defaultSort,
    defaultOrder = 'desc',
    perPage = PER_PAGE_PADRAO,
    maxPerPage = MAX_PER_PAGE_PADRAO,
    trashable = false,
  } = options;

  // `strictObject` também na query: `?ordr=asc` (typo) passaria despercebido
  // usando o padrão em silêncio — o mesmo tipo de falha muda que o `.strict()`
  // do corpo resolve.
  const schema = z.strictObject({
    page: z.coerce.number('página deve ser um número')
      .int('página deve ser um número inteiro')
      .min(1, 'a primeira página é 1')
      .default(1),

    perPage: z.coerce.number('perPage deve ser um número')
      .int('perPage deve ser um número inteiro')
      .min(1, 'perPage mínimo é 1')
      .max(maxPerPage, `perPage máximo é ${maxPerPage}`)
      .default(perPage),

    sort: z.enum(sortable, `ordenação inválida: use ${sortable.join(', ')}`).default(defaultSort),

    order: z.enum(['asc', 'desc'], 'ordem inválida: use asc ou desc').default(defaultOrder),

    q: z.string().trim().max(MAX_BUSCA, `busca: máximo de ${MAX_BUSCA} caracteres`)
      .optional()
      .transform(valor => valor || undefined),

    // Domínio sem lixeira nem aceita a chave: `?view=` vira 422 em vez de ser
    // ignorado (`strictObject` recusa o que não está no schema).
    ...(trashable
      ? { view: z.enum(['active', 'trashed'], 'view inválida: use active ou trashed').default('active') }
      : {}),
  });

  const query = schema.parse(raw ?? {});

  return {
    ...query,
    view: ('view' in query ? query.view : 'active') as ListView,
    skip: (query.page - 1) * query.perPage,
    take: query.perPage,
  };
}
