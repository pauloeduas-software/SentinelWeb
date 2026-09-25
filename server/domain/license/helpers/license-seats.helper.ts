import { Prisma } from '@prisma/client';
import { AppError } from '../../../core/errors/app-error';
import type { prisma } from '../../../core/database/prismaClient';

// OS ASSENTOS — a contagem e as travas, num lugar só.
//
// ═════════════════════════════════════════════════════════════════════════════
// A CONTA (D92), e por que ela não é a do D43
//
//   livres = assentos sem `retiredAt`, sem `burnedAt`, e sem ocupação aberta
//
// O plano prospectivo da F6 escrevia
// `livres = seatsTotal − ocupados − queimados − aposentados`, e aquela fórmula
// funciona enquanto ninguém encolhe o contrato. No instante em que alguém
// encolhe, ela mente: contrato de 5 vira 3, dois assentos ganham `retiredAt`,
// `seatsTotal` passa a 3 — e `3 − 0 − 0 − 2` dá **1**, quando a resposta certa
// é **3**. O aposentado JÁ SAIU de `seatsTotal` quando o contrato encolheu;
// subtraí-lo de novo é contá-lo duas vezes.
//
// Aqui a conta sai das LINHAS, como o `disponivel` do estoque (D34) e pelo
// mesmo motivo: a resposta não pode divergir das linhas quando ela *são* as
// linhas. `aposentados` vira número EXIBIDO — ele explica por que a tabela tem
// mais linhas que o contrato —, nunca subtraído.
//
// A invariante que amarra os dois lados é a 11:
//   COUNT(assentos sem `retiredAt`) = `seatsTotal`, sempre.
// Quem a mantém é `reconcile-seats.usecase.ts`.
// ═════════════════════════════════════════════════════════════════════════════

export type ClienteLicenca = Omit<typeof prisma, `$${string}`>;

/**
 * O mínimo que uma operação precisa ter para travar: só o SQL cru.
 *
 * Estrutural, e não `PrismaClient`, porque quem chama é sempre o `tx` de dentro
 * de uma `$transaction` — fora dela o `FOR UPDATE` é liberado no fim da própria
 * instrução e não protege nada. Mesmo contrato do `ClienteQueTrava` do
 * `user/use-cases/lock-user.usecase.ts` e do `stock-balance.helper.ts`.
 */
export interface ClienteQueTrava {
  $queryRaw<T = unknown>(query: Prisma.Sql): Promise<T>;
}

export interface ContagemDeAssentos {
  /** Com ocupação aberta agora. */
  ocupados: number;
  /** Devolvidos numa licença `reassignable = false` — perda de dinheiro. */
  queimados: number;
  /** O contrato encolheu e eles não existem mais — mudança de contrato. */
  aposentados: number;
  /** Utilizáveis e vazios. A resposta da pergunta que o módulo existe para responder. */
  livres: number;
}

const ZERO: ContagemDeAssentos = { ocupados: 0, queimados: 0, aposentados: 0, livres: 0 };

interface LinhaDaContagem {
  licenseId: string;
  ocupados: number;
  queimados: number;
  aposentados: number;
  livres: number;
}

/**
 * A contagem de VÁRIAS licenças, em UMA consulta.
 *
 * Em lote e não por linha pelo mesmo motivo do `contarEmUso` do estoque: a
 * listagem mostra até 100 licenças e uma consulta por linha seria N+1 para
 * pintar uma página — com a agravante de que aqui a conta é a COLUNA PRINCIPAL
 * da tela, então ninguém poderia deixá-la para depois.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUE `$queryRaw` E NÃO `groupBy`
 *
 * As quatro contagens saem de uma agregação sobre a JUNÇÃO de duas tabelas, e o
 * `groupBy` do Prisma não agrupa por campo de relação. As alternativas tipadas
 * eram três consultas separadas mais uma quarta que traz UMA LINHA POR ASSENTO
 * OCUPADO só para contá-las em memória — até cinco mil linhas para produzir
 * quatro números numa listagem de cem licenças.
 *
 * O `LEFT JOIN` aqui não multiplica linha nenhuma, e a garantia disso é do
 * banco: `license_seat_uma_aberta_por_assento` é índice único parcial, então
 * cada assento tem NO MÁXIMO uma ocupação aberta para casar. Sem esse índice
 * esta consulta contaria duplicado — é a mesma invariante servindo a duas
 * coisas.
 *
 * O `Prisma.join` parametriza os ids: nada é concatenado como texto.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export async function contarAssentos(
  client: ClienteLicenca & ClienteQueTrava,
  licenseIds: readonly string[],
): Promise<Map<string, ContagemDeAssentos>> {
  const contagem = new Map<string, ContagemDeAssentos>();
  if (licenseIds.length === 0) return contagem;

  // `::int` porque `COUNT` no Postgres devolve BIGINT, e o driver o entrega
  // como `BigInt` — que `JSON.stringify` recusa serializar. Converter no banco
  // é uma palavra; converter em JS seria um `Number()` por campo, esquecível.
  const linhas = await client.$queryRaw<LinhaDaContagem[]>(Prisma.sql`
    SELECT s."licenseId"::text AS "licenseId",
           COUNT(*) FILTER (WHERE s."retiredAt" IS NULL AND s."burnedAt" IS NULL
                              AND c.id IS NOT NULL)::int AS "ocupados",
           COUNT(*) FILTER (WHERE s."retiredAt" IS NULL AND s."burnedAt" IS NOT NULL)::int AS "queimados",
           COUNT(*) FILTER (WHERE s."retiredAt" IS NOT NULL)::int AS "aposentados",
           COUNT(*) FILTER (WHERE s."retiredAt" IS NULL AND s."burnedAt" IS NULL
                              AND c.id IS NULL)::int AS "livres"
      FROM license_seats s
      LEFT JOIN license_seat_checkouts c
             ON c."seatId" = s.id AND c."checkinAt" IS NULL
     WHERE s."licenseId" IN (${Prisma.join(licenseIds.map((id) => Prisma.sql`${id}::uuid`))})
     GROUP BY s."licenseId"
  `);

  for (const linha of linhas) {
    contagem.set(linha.licenseId, {
      ocupados: linha.ocupados,
      queimados: linha.queimados,
      aposentados: linha.aposentados,
      livres: linha.livres,
    });
  }
  return contagem;
}

/** A de uma licença só. Atalho sobre a versão em lote — uma implementação, uma conta. */
export async function contarAssentosDe(
  client: ClienteLicenca & ClienteQueTrava,
  licenseId: string,
): Promise<ContagemDeAssentos> {
  return (await contarAssentos(client, [licenseId])).get(licenseId) ?? ZERO;
}

// ---------------------------------------------------------------------------
// AS TRAVAS — e a assimetria entre elas é a decisão D90
// ---------------------------------------------------------------------------

/**
 * PEGA E TRAVA o primeiro assento livre, na MESMA instrução (D41).
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * `SKIP LOCKED`, e o preço dele
 *
 * Escolher com um `SELECT` e travar com outro deixa a janela entre os dois: as
 * duas requisições escolhem o assento 3 e as duas tentam gravar. Escolher e
 * travar juntos fecha a janela, e o `SKIP LOCKED` faz a segunda pegar o assento
 * 4 em vez de ESPERAR a primeira — para entrega de licença, falhar rápido e
 * mandar tentar de novo é melhor do que enfileirar requisições HTTP.
 *
 * O PREÇO, DECLARADO: sob contenção alta, `SKIP LOCKED` pode devolver "sem
 * assento livre" mesmo havendo um assento cuja transação concorrente vá cair no
 * rollback um instante depois — um 409 falso e raro. A alternativa
 * (`FOR UPDATE` sem skip) troca isso por fila: todo mundo espera o primeiro.
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * `NOT EXISTS` e `FOR UPDATE OF s` não são estilo: montar a mesma busca com
 * `LEFT JOIN … GROUP BY` faz o Postgres RECUSAR a consulta — *"FOR UPDATE
 * cannot be applied to the nullable side of an outer join"*. O `OF s` trava
 * explicitamente só a tabela dos assentos, que é a única que precisa.
 *
 * Devolve `null` quando não há assento livre; quem decide se isso é 409 é o
 * use-case, que tem os números para a frase.
 */
export async function pegarAssentoLivre(
  client: ClienteQueTrava,
  licenseId: string,
): Promise<{ id: string; seatNumber: number } | null> {
  const linhas = await client.$queryRaw<{ id: string; seatNumber: number }[]>(Prisma.sql`
    SELECT s.id::text AS id, s."seatNumber"
      FROM license_seats s
     WHERE s."licenseId" = ${licenseId}::uuid
       AND s."burnedAt" IS NULL
       AND s."retiredAt" IS NULL
       AND NOT EXISTS (
             SELECT 1 FROM license_seat_checkouts c
              WHERE c."seatId" = s.id AND c."checkinAt" IS NULL
           )
     ORDER BY s."seatNumber"
     LIMIT 1
     FOR UPDATE OF s SKIP LOCKED
  `);

  return linhas[0] ?? null;
}

/**
 * Trava UM assento e espera, sem pular.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * É O QUE FECHA A SEGUNDA CORRIDA — a que o D41 não cita.
 *
 * O checkin fecha uma linha de `license_seat_checkouts`. Sem travar o ASSENTO,
 * ele não disputa linha nenhuma com o checkout: em READ COMMITTED, o
 * `FOR UPDATE OF s` do `pegarAssentoLivre` só reavalia o `WHERE` para linhas
 * que uma transação concorrente tenha ATUALIZADO NA TABELA TRAVADA — e o
 * checkin não atualiza `license_seats`. Resultado: um assento liberado um
 * instante antes pode não ser visto, e a entrega responde 409 com assento livre
 * no banco.
 *
 * Travar aqui custa NADA: o checkin precisa desta linha de qualquer forma para
 * escrever `burnedAt` na queima. E não há deadlock — checkout e checkin tomam
 * o assento como primeira trava depois do alvo, sempre na mesma ordem.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export async function travarAssento(client: ClienteQueTrava, seatId: string): Promise<boolean> {
  const linhas = await client.$queryRaw<{ id: string }[]>(
    Prisma.sql`SELECT id FROM license_seats WHERE id = ${seatId}::uuid FOR UPDATE`,
  );
  return linhas.length > 0;
}

/**
 * Trava a linha da LICENÇA. É o mutex do contrato.
 *
 * Serializa duas edições simultâneas de `seatsTotal`: sem ela, as duas leem 5,
 * uma grava 8 e a outra 6, e as duas inserem assentos — o `seatNumber` colide
 * no índice único e o P2002 vira "Registro já existe", uma frase que não ensina
 * nada a quem só aumentou o contrato.
 *
 * NÃO filtra `deletedAt`: travar é sobre a LINHA, e uma licença na lixeira
 * continua sendo uma linha que o restore vai disputar. Quem decide o que fazer
 * com a lixeira é a consulta seguinte, que passa pelo escopo da extension.
 */
export async function travarLicenca(client: ClienteQueTrava, licenseId: string): Promise<boolean> {
  const linhas = await client.$queryRaw<{ id: string }[]>(
    Prisma.sql`SELECT id FROM licenses WHERE id = ${licenseId}::uuid FOR UPDATE`,
  );
  return linhas.length > 0;
}

/** A mesma trava, com o 404 que todo chamador daria. */
export async function travarLicencaOuFalhar(client: ClienteQueTrava, licenseId: string): Promise<void> {
  if (!(await travarLicenca(client, licenseId))) {
    throw new AppError('Nenhuma licença com este identificador.', 404);
  }
}

/**
 * Trava TODOS os assentos da licença, esperando por cada um (D90).
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * QUEM RECONCILIA TRAVA TUDO; QUEM ENTREGA TRAVA UM ASSENTO.
 *
 * A assimetria é deliberada. Entregar é o caminho quente e reconciliar é edição
 * de contrato, que acontece quando chega nota fiscal:
 *
 *   - travar a licença inteira NA ENTREGA enfileiraria todo checkout da mesma
 *     licença e jogaria fora o D41;
 *   - travar nada NA RECONCILIAÇÃO corrompe a conta — ela lê "2 livres", marca
 *     os dois `retiredAt`, e uma entrega simultânea (que trava O ASSENTO, não a
 *     licença) leva um deles no meio. O resultado é um assento ocupado e
 *     aposentado ao mesmo tempo: sai da conta de livres, sai da conta de
 *     comprados, e continua na mão de alguém. Em READ COMMITTED nada acusa.
 *
 * `ORDER BY "seatNumber"` e SEM `SKIP LOCKED`: ela precisa de TODOS, então
 * espera. Depois de segurar os N, nenhum checkout pode estar em voo — o que
 * começou antes já confirmou (e a contagem seguinte o enxerga), e o que chegar
 * depois vê tudo travado, pula tudo e recebe o 409 de "sem assento livre".
 *
 * SEM DEADLOCK, e o argumento é a ordem: os dois lados tomam assentos em
 * `seatNumber` crescente, e ninguém segura assento esperando a licença — a
 * licença é sempre a PRIMEIRA trava de quem a toma.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export async function travarTodosOsAssentos(client: ClienteQueTrava, licenseId: string): Promise<void> {
  await client.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT id FROM license_seats
     WHERE "licenseId" = ${licenseId}::uuid
     ORDER BY "seatNumber"
     FOR UPDATE
  `);
}
