-- CreateEnum
CREATE TYPE "Papel" AS ENUM ('USUARIO', 'TECNICO', 'ADMIN');

-- DropForeignKey
ALTER TABLE "_GroupToUser" DROP CONSTRAINT "_GroupToUser_A_fkey";

-- DropForeignKey
ALTER TABLE "_GroupToUser" DROP CONSTRAINT "_GroupToUser_B_fkey";

-- DropForeignKey
ALTER TABLE "acceptances" DROP CONSTRAINT "acceptances_assetId_fkey";

-- DropForeignKey
ALTER TABLE "acceptances" DROP CONSTRAINT "acceptances_assignmentId_fkey";

-- DropForeignKey
ALTER TABLE "alerts" DROP CONSTRAINT "alerts_assetId_fkey";

-- DropForeignKey
ALTER TABLE "api_tokens" DROP CONSTRAINT "api_tokens_userId_fkey";

-- DropForeignKey
ALTER TABLE "asset_models" DROP CONSTRAINT "asset_models_customFieldsetId_fkey";

-- DropForeignKey
ALTER TABLE "asset_models" DROP CONSTRAINT "asset_models_depreciationId_fkey";

-- DropForeignKey
ALTER TABLE "audits" DROP CONSTRAINT "audits_assetId_fkey";

-- DropForeignKey
ALTER TABLE "auth_events" DROP CONSTRAINT "auth_events_userId_fkey";

-- DropForeignKey
ALTER TABLE "categories" DROP CONSTRAINT "categories_customFieldsetId_fkey";

-- DropForeignKey
ALTER TABLE "custom_fieldset_fields" DROP CONSTRAINT "custom_fieldset_fields_fieldId_fkey";

-- DropForeignKey
ALTER TABLE "custom_fieldset_fields" DROP CONSTRAINT "custom_fieldset_fields_fieldsetId_fkey";

-- DropForeignKey
ALTER TABLE "import_rows" DROP CONSTRAINT "import_rows_importId_fkey";

-- DropForeignKey
ALTER TABLE "maintenances" DROP CONSTRAINT "maintenances_assetId_fkey";

-- DropForeignKey
ALTER TABLE "maintenances" DROP CONSTRAINT "maintenances_supplierId_fkey";

-- DropIndex
DROP INDEX "asset_models_customFieldsetId_idx";

-- DropIndex
DROP INDEX "asset_models_depreciationId_idx";

-- DropIndex
DROP INDEX "assets_customFields_idx";

-- DropIndex
DROP INDEX "assets_lastAuditAt_idx";

-- DropIndex
DROP INDEX "categories_customFieldsetId_idx";

-- DropIndex
DROP INDEX "users_externalId_idx";

-- AlterTable
ALTER TABLE "asset_models" DROP COLUMN "customFieldsetId",
DROP COLUMN "depreciationId";

-- AlterTable
ALTER TABLE "assets" DROP COLUMN "customFields",
DROP COLUMN "lastAuditAt";

-- AlterTable
ALTER TABLE "categories" DROP COLUMN "customFieldsetId";

-- AlterTable
ALTER TABLE "users" DROP COLUMN "authSource",
DROP COLUMN "directoryMissingAt",
DROP COLUMN "directorySyncedAt",
DROP COLUMN "externalId",
DROP COLUMN "totpEnabledAt",
DROP COLUMN "totpRecoveryCodes",
DROP COLUMN "totpSecret",
ADD COLUMN     "role" "Papel" NOT NULL DEFAULT 'USUARIO';

-- ─────────────────────────────────────────────────────────────────────────────
-- O BACKFILL DO PAPEL (D148), e ele roda AQUI: depois de a coluna existir e
-- ANTES de `groups` e `_GroupToUser` serem derrubadas.
--
-- SEM ISTO, A MIGRAÇÃO APAGA QUEM ERA ADMINISTRADOR. O `DEFAULT 'USUARIO'` da
-- coluna é a porta fechada por padrão para conta NOVA; aplicado a um banco que
-- já tem gente, ele rebaixa todo mundo — inclusive a única conta capaz de
-- promover alguém de volta. O sintoma é o sistema trancado: login entra e toda
-- rota responde 403.
--
-- A TRADUÇÃO É DE UMA MATRIZ PARA TRÊS VALORES, e ela erra para o lado seguro:
--   `access.manage`  → ADMIN      quem administrava acesso continua podendo;
--   qualquer chave   → TECNICO    quem tinha alguma permissão mexia no
--                                 inventário, que é o que TECNICO alcança;
--   grupo nenhum     → USUARIO    pelo `DEFAULT`, sem precisar de UPDATE.
--
-- `settings.manage` entra em ADMIN junto com `access.manage`: as duas eram as
-- chaves de administração do sistema, e o papel não as separa.
UPDATE "users" u
   SET "role" = 'ADMIN'
 WHERE EXISTS (
   SELECT 1
     FROM "_GroupToUser" gu
     JOIN "groups" g ON g.id = gu."A"
    WHERE gu."B" = u.id
      AND (g.permissions->>'access.manage' = 'true'
        OR g.permissions->>'settings.manage' = 'true')
 );

UPDATE "users" u
   SET "role" = 'TECNICO'
 WHERE u."role" = 'USUARIO'
   AND EXISTS (
     SELECT 1
       FROM "_GroupToUser" gu
       JOIN "groups" g ON g.id = gu."A"
      WHERE gu."B" = u.id
        AND g.permissions <> '{}'::jsonb
   );
-- ─────────────────────────────────────────────────────────────────────────────


-- DropTable
DROP TABLE "_GroupToUser";

-- DropTable
DROP TABLE "acceptances";

-- DropTable
DROP TABLE "alerts";

-- DropTable
DROP TABLE "api_tokens";

-- DropTable
DROP TABLE "audits";

-- DropTable
DROP TABLE "auth_events";

-- DropTable
DROP TABLE "custom_fields";

-- DropTable
DROP TABLE "custom_fieldset_fields";

-- DropTable
DROP TABLE "custom_fieldsets";

-- DropTable
DROP TABLE "depreciations";

-- DropTable
DROP TABLE "groups";

-- DropTable
DROP TABLE "import_rows";

-- DropTable
DROP TABLE "imports";

-- DropTable
DROP TABLE "maintenances";

-- DropEnum
DROP TYPE "AlertType";

-- DropEnum
DROP TYPE "ApiTokenOwner";

-- DropEnum
DROP TYPE "AuditMethod";

-- DropEnum
DROP TYPE "AuditResult";

-- DropEnum
DROP TYPE "AuthEventType";

-- DropEnum
DROP TYPE "AuthSource";

-- DropEnum
DROP TYPE "CustomFieldElement";

-- DropEnum
DROP TYPE "CustomFieldFormat";

-- DropEnum
DROP TYPE "DepreciationFloorType";

-- DropEnum
DROP TYPE "ImportRowStatus";

-- DropEnum
DROP TYPE "ImportStatus";

-- DropEnum
DROP TYPE "ImportTarget";

-- DropEnum
DROP TYPE "MaintenanceType";

