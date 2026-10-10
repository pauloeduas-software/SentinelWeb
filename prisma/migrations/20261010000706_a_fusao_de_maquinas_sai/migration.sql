-- A FUSÃO DE MÁQUINAS SAI.
--
-- O `hwid` que o agente manda é derivado do hardware e estável entre
-- reinstalações, então a duplicação que a fusão resolvia não acontece: não há
-- segunda linha para a mesma máquina. Saem o tipo de sugestão `MERGE`, o sinal
-- `MAC` (que só pontuava máquina contra máquina), a auto-relação
-- `endpoints.mergedIntoId` e o alvo `reconciliation_suggestions.mergeIntoEndpointId`.
--
-- AS LINHAS DOS VALORES QUE SAEM, ANTES DE OS ENUMS ENCOLHEREM. Os dois
-- `ALTER COLUMN ... USING` abaixo falham com *invalid input value for enum* em
-- qualquer linha que ainda carregue o valor antigo, e abortam a transação.
--
--   `kind` é NOT NULL, então não há saída por `UPDATE`: a linha tem que SAIR.
--   `signal` é nulável, então basta zerá-la.
--
-- O `UPDATE` do sinal é redundante depois do `DELETE` — `MAC` só era produzido
-- pela cascata máquina↔máquina, que só alimentava propostas `MERGE` —, e fica
-- como rede para um banco com histórico que ninguém controla. Nos bancos locais
-- as duas instruções são no-op.

DELETE FROM "reconciliation_suggestions" WHERE "kind" = 'MERGE';

UPDATE "reconciliation_suggestions" SET "signal" = NULL WHERE "signal" = 'MAC';

-- AS MÁQUINAS JÁ FUNDIDAS NÃO SÃO APAGADAS, e isto é decisão.
--
-- Com a coluna fora, as linhas que tinham `mergedIntoId` preenchido voltam a
-- aparecer nas listagens e nas contagens de cobertura — hoje elas estavam
-- escondidas por sete filtros `mergedIntoId: null`. Apagá-las levaria junto a
-- telemetria daquela instalação, que é precisamente o que o D103 preservava, e
-- seria uma escrita destrutiva por um caso que nenhum banco deste projeto tem:
-- nenhum agente jamais conectou, e `endpoints` está vazia nos dois bancos.

-- AlterEnum
BEGIN;
CREATE TYPE "MatchSignal_new" AS ENUM ('SERIAL', 'UUID', 'HOSTNAME');
ALTER TABLE "reconciliation_suggestions" ALTER COLUMN "signal" TYPE "MatchSignal_new" USING ("signal"::text::"MatchSignal_new");
ALTER TYPE "MatchSignal" RENAME TO "MatchSignal_old";
ALTER TYPE "MatchSignal_new" RENAME TO "MatchSignal";
DROP TYPE "MatchSignal_old";
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "SuggestionKind_new" AS ENUM ('LINK');
ALTER TABLE "reconciliation_suggestions" ALTER COLUMN "kind" TYPE "SuggestionKind_new" USING ("kind"::text::"SuggestionKind_new");
ALTER TYPE "SuggestionKind" RENAME TO "SuggestionKind_old";
ALTER TYPE "SuggestionKind_new" RENAME TO "SuggestionKind";
DROP TYPE "SuggestionKind_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "endpoints" DROP CONSTRAINT "endpoints_mergedIntoId_fkey";

-- DropForeignKey
ALTER TABLE "reconciliation_suggestions" DROP CONSTRAINT "reconciliation_suggestions_mergeIntoEndpointId_fkey";

-- AlterTable
ALTER TABLE "endpoints" DROP COLUMN "mergedIntoId";

-- ── A INVARIANTE 13 SAI DA FRENTE, E VOLTA COM UM ALVO ────────────────────
--
-- Mesmo cuidado da migration da observação de usuário: `sugestao_pendente_por_alvo`
-- é PARCIAL, nasce à mão (o Prisma não expressa `WHERE`) e cita no COALESCE a
-- coluna que o `DROP COLUMN` abaixo derruba. Sem este par explícito o Postgres o
-- levaria embora em SILÊNCIO, e a fila voltaria a poder empilhar.
DROP INDEX "sugestao_pendente_por_alvo";

-- AlterTable
ALTER TABLE "reconciliation_suggestions" DROP COLUMN "mergeIntoEndpointId";

-- A mesma invariante com UM alvo. O `COALESCE` continua, e não é cerimônia: a
-- coluna segue nulável, e em Postgres dois `NULL` nunca colidem num índice
-- único — uma linha `PENDING` com `assetId` nulo (bug, carga à mão) voltaria a
-- poder empilhar sem limite, em silêncio. O código promete que `LINK` sempre tem
-- ativo; o índice não depende dessa promessa.
CREATE UNIQUE INDEX "sugestao_pendente_por_alvo"
  ON "reconciliation_suggestions" (
    "kind",
    "endpointId",
    COALESCE("assetId", '00000000-0000-0000-0000-000000000000'::uuid)
  )
  WHERE "state" = 'PENDING';
