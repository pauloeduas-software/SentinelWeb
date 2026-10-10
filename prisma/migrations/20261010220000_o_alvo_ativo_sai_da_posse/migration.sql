-- O ALVO `ASSET` SAI DA POSSE.
--
-- Ativo é computador, e um computador não é entregue a outro computador: o que
-- acompanha a máquina (dock, monitor, cabo) é estoque, por quantidade. O alvo
-- existia para a dock presa ao notebook, e a dock deixou de ser ativo.
--
-- AS LINHAS DO VALOR QUE SAI, ANTES DE O ENUM ENCOLHER. O `ALTER COLUMN ...
-- USING` abaixo falha com *invalid input value for enum* em qualquer linha com
-- `targetType = 'ASSET'`, e a transação inteira aborta. Apagá-las é parte do
-- corte, não efeito colateral: uma posse "preso à dock" não descreve nada num
-- sistema em que a dock não é ativo. Nos bancos locais isto é no-op.
DELETE FROM "assignments" WHERE "targetType" = 'ASSET';

-- OS DOIS CHECKs QUE CITAM A COLUNA saem ANTES do `DROP COLUMN` — o Postgres
-- os levaria embora em silêncio junto com a coluna, e o da coerência do alvo
-- tem que VOLTAR, escrito para duas FKs. O de "não entregue a si mesmo" não
-- volta: sem alvo ativo não há ciclo possível.
ALTER TABLE "assignments" DROP CONSTRAINT "assignments_alvo_coerente";
ALTER TABLE "assignments" DROP CONSTRAINT "assignments_nao_entregue_a_si_mesmo";

-- AlterEnum
BEGIN;
CREATE TYPE "AssignmentTarget_new" AS ENUM ('USER', 'LOCATION');
ALTER TABLE "assignments" ALTER COLUMN "targetType" TYPE "AssignmentTarget_new" USING ("targetType"::text::"AssignmentTarget_new");
ALTER TYPE "AssignmentTarget" RENAME TO "AssignmentTarget_old";
ALTER TYPE "AssignmentTarget_new" RENAME TO "AssignmentTarget";
DROP TYPE "AssignmentTarget_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "assignments" DROP CONSTRAINT "assignments_targetAssetId_fkey";

-- DropIndex
DROP INDEX "assignments_targetAssetId_checkinAt_idx";

-- AlterTable
ALTER TABLE "assignments" DROP COLUMN "targetAssetId";

-- ── INVARIANTE 5, com DOIS alvos: exatamente UMA FK preenchida, a que casa ────
-- com o `targetType`. O terceiro CHECK (`assignments_devolucao_nao_antecede_
-- entrega`) não cita a coluna e fica como está.
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_alvo_coerente" CHECK (
  num_nonnulls("targetUserId", "targetLocationId") = 1
  AND (
       ("targetType" = 'USER'     AND "targetUserId"     IS NOT NULL)
    OR ("targetType" = 'LOCATION' AND "targetLocationId" IS NOT NULL)
  )
);
