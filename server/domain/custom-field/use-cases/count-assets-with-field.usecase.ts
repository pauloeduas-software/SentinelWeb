import { Prisma } from '@prisma/client';
import type { prisma } from '../../../core/database/prismaClient';

// QUANTOS ATIVOS TÊM ESTA CHAVE NO JsonB — em SQL cru, e o motivo é medido.
//
// ═════════════════════════════════════════════════════════════════════════════
// O ÍNDICE GIN SÓ É ALCANÇADO POR `?` E `@>`. O PRISMA TIPADO NÃO OS EMITE.
//
// `customFields: { path: [slug], not: Prisma.DbNull }` parece a tradução certa
// da pergunta, e é o que o plano da fase previa. O SQL que sai é:
//
//     WHERE ("customFields" #> ARRAY['imei']::text[])::jsonb IS NOT NULL
//
// Uma comparação de EXPRESSÃO sobre a coluna, que nenhum índice GIN serve.
// Medido em 50 mil linhas, com a chave presente em 40 delas:
//
//     ?  'imei'                         → Bitmap Index Scan   0,05 ms
//     (#> ARRAY['imei']) IS NOT NULL    → Seq Scan            5,2  ms
//
// Cem vezes, e a diferença cresce com a tabela porque uma é O(log n) e a outra é
// O(n). Por isso esta pergunta desce para `$queryRaw`: ela varre a tabela de
// ATIVOS inteira, é a base do 409 que impede apagar um campo em uso (D64) e do
// contador que o D61 mostra antes de promover um campo a obrigatório.
//
// O FILTRO DA LISTAGEM continua no Prisma tipado, e a razão é composição: ele se
// soma a vista, status, localização, busca, ordenação e paginação num `where` só.
// Ele paga a varredura (13,5 ms por 50 mil linhas, medido) e esse número é o que
// esta fase entrega à F10 — ver `asset-filters.helper.ts`.
// ═════════════════════════════════════════════════════════════════════════════

/** Cliente que sabe falar SQL cru: o global ou o de transação. */
type ClienteComRaw = Pick<typeof prisma, '$queryRaw'>;

/**
 * Conta ativos com a chave `slug` PRESENTE, incluindo a lixeira.
 *
 * `INCLUINDO_LIXEIRA` não existe em SQL cru, e aqui não é esquecimento: a
 * consulta não filtra `deleted_at` DE PROPÓSITO. Um ativo apagado ainda usa o
 * campo — restaurá-lo traz o valor de volta —, então apagar o campo no meio
 * deixaria a chave órfã sem aviso. É a mesma decisão do `countUsages` das outras
 * specs, escrita aqui porque a extension de soft delete não alcança `$queryRaw`.
 *
 * O `slug` entra como PARÂMETRO (`$1`), nunca interpolado: ele vem validado pelo
 * schema (`^[a-z][a-z0-9_]*$`), e ainda assim interpolar seria escrever uma
 * injeção de SQL confiando numa validação que mora em outro arquivo.
 */
export async function countAssetsWithField(client: ClienteComRaw, slug: string): Promise<number> {
  const [linha] = await client.$queryRaw<{ total: bigint }[]>(
    Prisma.sql`SELECT count(*)::bigint AS total FROM "assets" WHERE "customFields" ? ${slug}`,
  );
  // `count(*)` volta como `bigint`: sem o `Number` ele chega no JSON como um
  // valor que o `JSON.stringify` recusa ("Do not know how to serialize a BigInt").
  return Number(linha?.total ?? 0n);
}

/**
 * Quantos ativos QUEBRARIAM se este campo virasse obrigatório — o número que o
 * D61 manda mostrar antes de deixar a promoção acontecer.
 *
 * São os ativos VIVOS dos modelos que usam o conjunto e que **não têm a chave**.
 * Não é o complemento do `countAssetsWithField`: quem nunca preencheu o campo
 * não tem a chave nenhuma (limpar um valor a REMOVE — ver `semNulos`), então
 * "sem valor" e "sem chave" são a mesma coisa aqui, por construção.
 *
 * A lixeira fica de FORA desta contagem, ao contrário da de cima, e a diferença
 * é a pergunta: ali é *"apagar este campo deixa órfão?"* (e o ativo apagado pode
 * voltar); aqui é *"promover este campo trava a edição de quem está no parque
 * hoje?"* — e quem está na lixeira não está no parque.
 */
export async function countAssetsQueQuebrariam(
  client: ClienteComRaw,
  slug: string,
  modelIds: string[],
): Promise<number> {
  // Sem modelo nenhum usando o conjunto, ninguém quebra — e um `IN ()` vazio é
  // SQL inválido.
  if (modelIds.length === 0) return 0;

  const [linha] = await client.$queryRaw<{ total: bigint }[]>(
    Prisma.sql`
      SELECT count(*)::bigint AS total
        FROM "assets"
       WHERE "deletedAt" IS NULL
         AND "modelId" IN (${Prisma.join(modelIds.map((id) => Prisma.sql`${id}::uuid`))})
         -- A COLUNA NULA ENTRA NA CONTA, e por isso a condição é escrita por
         -- extenso: NOT (NULL ? 'x') resulta NULL, não TRUE, e o WHERE descarta
         -- NULL. Sem o primeiro ramo, o ativo que nunca teve campo customizado
         -- nenhum -- a maioria -- ficaria de fora do contador que decide se a
         -- promocao a obrigatorio acontece hoje ou depois do backfill (D61).
         AND ("customFields" IS NULL OR NOT ("customFields" ? ${slug}))
    `,
  );
  return Number(linha?.total ?? 0n);
}
