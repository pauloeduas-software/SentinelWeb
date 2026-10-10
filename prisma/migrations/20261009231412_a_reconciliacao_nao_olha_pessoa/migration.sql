-- A RECONCILIAÇÃO DEIXA DE OLHAR PESSOA.
--
-- Sai a observação do usuário logado: a tabela `endpoint_user_daily`, a coluna
-- `endpoints.loggedOnUser`, os três tipos de sugestão que falavam de gente
-- (`CHECKOUT`, `OCCUPANCY`, `SHARED_POST`), os dois alvos e o turno da
-- sugestão, e as três configurações que só eles liam.

-- ── AS LINHAS DOS TIPOS QUE SAEM, ANTES DE O ENUM ENCOLHER ────────────────
--
-- O `ALTER COLUMN ... USING ("kind"::text::"SuggestionKind_new")` abaixo falha
-- com *invalid input value for enum* em QUALQUER linha de tipo removido, e a
-- transação inteira aborta. E essas linhas existem por desenho em todo banco
-- que já rodou o job: as `PENDING`, as `REJECTED` (a memória do D97) e as
-- `ACCEPTED` (a trilha de quem decidiu).
--
-- Apagá-las é PARTE DO CORTE, não efeito colateral: uma recusa de "entregar
-- este ativo à Ana" não é memória de nada depois que o sistema para de propor
-- posse. O banco de desenvolvimento está vazio e isto é no-op nele — o
-- `DELETE` existe para o banco que não está.
DELETE FROM "reconciliation_suggestions" WHERE "kind" IN ('CHECKOUT', 'OCCUPANCY', 'SHARED_POST');

-- AlterEnum
BEGIN;
CREATE TYPE "SuggestionKind_new" AS ENUM ('LINK', 'MERGE');
ALTER TABLE "reconciliation_suggestions" ALTER COLUMN "kind" TYPE "SuggestionKind_new" USING ("kind"::text::"SuggestionKind_new");
ALTER TYPE "SuggestionKind" RENAME TO "SuggestionKind_old";
ALTER TYPE "SuggestionKind_new" RENAME TO "SuggestionKind";
DROP TYPE "SuggestionKind_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "endpoint_user_daily" DROP CONSTRAINT "endpoint_user_daily_endpointId_fkey";

-- DropForeignKey
ALTER TABLE "endpoint_user_daily" DROP CONSTRAINT "endpoint_user_daily_userId_fkey";

-- DropForeignKey
ALTER TABLE "reconciliation_suggestions" DROP CONSTRAINT "reconciliation_suggestions_targetLocationId_fkey";

-- DropForeignKey
ALTER TABLE "reconciliation_suggestions" DROP CONSTRAINT "reconciliation_suggestions_targetUserId_fkey";

-- AlterTable
ALTER TABLE "app_settings" DROP COLUMN "ignoredUserKeys",
DROP COLUMN "timezone",
DROP COLUMN "userDailyRetentionDays";

-- AlterTable
ALTER TABLE "endpoints" DROP COLUMN "loggedOnUser";

-- ── A INVARIANTE 13 SAI DA FRENTE, E VOLTA MENOR ──────────────────────────
--
-- `sugestao_pendente_por_alvo` é PARCIAL e nasce à mão (o Prisma não expressa
-- `WHERE`), e ele cita no COALESCE as duas colunas que o `DROP COLUMN` abaixo
-- derruba. Sem este par explícito o Postgres o levaria embora em SILÊNCIO junto
-- com as colunas — e a fila voltaria a poder empilhar a mesma sugestão.
DROP INDEX "sugestao_pendente_por_alvo";

-- AlterTable
ALTER TABLE "reconciliation_suggestions" DROP COLUMN "shift",
DROP COLUMN "targetLocationId",
DROP COLUMN "targetUserId";

-- A mesma invariante com DOIS alvos em vez de quatro. O `COALESCE` continua
-- porque em Postgres dois `NULL` nunca colidem num índice único: sem ele, a
-- mesma sugestão de vínculo entraria N vezes.
CREATE UNIQUE INDEX "sugestao_pendente_por_alvo"
  ON "reconciliation_suggestions" (
    "kind",
    "endpointId",
    COALESCE("assetId",             '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE("mergeIntoEndpointId", '00000000-0000-0000-0000-000000000000'::uuid)
  )
  WHERE "state" = 'PENDING';

-- DropTable
DROP TABLE "endpoint_user_daily";

