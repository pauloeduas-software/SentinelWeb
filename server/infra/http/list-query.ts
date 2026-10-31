import { z } from 'zod';

// Paginação e busca de qualquer listagem — em um lugar só.
//
// A ORDEM NÃO MORA AQUI, nem vem do cliente: cada use-case ordena pelo seu
// critério fixo (o catálogo por nome, o inventário pelo mais recente). Nenhuma
// tela oferece ordenação por coluna, e um `?sort=` aceito sem consumidor seria
// um contrato a manter para ninguém. `strictObject` recusa a chave com 422.

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

export interface ListQuery {
  page: number;
  perPage: number;
  /** Prontos para o Prisma, para o use-case não recalcular. */
  skip: number;
  take: number;
  /** Termo de busca já limpo; `undefined` quando não veio nada. */
  q?: string;
  /** `trashed` lista a lixeira. Só existe quando o domínio declara `trashable`. */
  view: ListView;
}

interface ListQueryOptions {
  perPage?: number;
  maxPerPage?: number;
  /**
   * O domínio tem lixeira (coluna `deletedAt`) e aceita `?view=trashed`.
   *
   * É opt-in em vez de sempre aceito: num domínio sem lixeira, um
   * `?view=trashed` não faria nada — e aceitar em silêncio um parâmetro sem
   * efeito é o mesmo tipo de falha muda que o `strictObject` existe para evitar.
   */
  trashable?: boolean;
  /**
   * A listagem tem busca e aceita `?q=`. Padrão `true`; a que não busca nada
   * desliga, pelo mesmo motivo do `trashable`: aceitar em silêncio um `?q=` sem
   * efeito faria a tela dizer "filtrado" sobre uma lista inteira.
   */
  searchable?: boolean;
}

export function parseListQuery(raw: unknown, options: ListQueryOptions = {}): ListQuery {
  const {
    perPage = PER_PAGE_PADRAO,
    maxPerPage = MAX_PER_PAGE_PADRAO,
    trashable = false,
    searchable = true,
  } = options;

  // `strictObject` também na query: `?pag=2` (typo) passaria despercebido
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

    ...(searchable
      ? {
          q: z.string().trim().max(MAX_BUSCA, `busca: máximo de ${MAX_BUSCA} caracteres`)
            .optional()
            .transform(valor => valor || undefined),
        }
      : {}),

    // Domínio sem lixeira nem aceita a chave: `?view=` vira 422 em vez de ser
    // ignorado (`strictObject` recusa o que não está no schema).
    ...(trashable
      ? { view: z.enum(['active', 'trashed'], 'view inválida: use active ou trashed').default('active') }
      : {}),
  });

  const query = schema.parse(raw ?? {});

  return {
    ...query,
    q: 'q' in query ? query.q as string | undefined : undefined,
    view: ('view' in query ? query.view : 'active') as ListView,
    skip: (query.page - 1) * query.perPage,
    take: query.perPage,
  };
}
