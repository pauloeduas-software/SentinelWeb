-- ---------------------------------------------------------------------------
-- CONVERGÊNCIA RMM × ITAM — docs/FASE-7-PLANO-ITAM.md
--
-- O QUE FOI CORRIGIDO À MÃO no que o `migrate diff` gerou, e por quê:
--
--   1. `endpoints.status` String → enum. O gerador emitiu
--      `DROP COLUMN "status"` + `ADD COLUMN … DEFAULT 'ONLINE'`, que APAGA a
--      coluna e devolve a frota inteira para ONLINE em silêncio — inclusive as
--      máquinas que o `zombie-cleaner` tinha acabado de marcar OFFLINE. Trocado
--      pelo `ALTER … TYPE … USING`, que converte o dado. É exatamente o caso que
--      o docs/ARQUITETURA.md manda procurar antes de aplicar.
--
--   2. O índice PARCIAL da fila de sugestões, que o Prisma não expressa.
-- ---------------------------------------------------------------------------

-- CreateEnum
CREATE TYPE "AgentStatus" AS ENUM ('ONLINE', 'OFFLINE');

-- CreateEnum
CREATE TYPE "ReviewState" AS ENUM ('UNREVIEWED', 'ALLOWED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "DiscoveryMode" AS ENUM ('OFF', 'SUGGEST', 'ON');

-- CreateEnum
CREATE TYPE "MatchSignal" AS ENUM ('SERIAL', 'UUID', 'MAC', 'HOSTNAME');

-- CreateEnum
CREATE TYPE "SuggestionKind" AS ENUM ('LINK', 'MERGE', 'CHECKOUT', 'OCCUPANCY', 'SHARED_POST');

-- CreateEnum
CREATE TYPE "SuggestionState" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'SUPERSEDED');

-- AlterTable
ALTER TABLE "app_settings" ADD COLUMN     "discoveryMode" "DiscoveryMode" NOT NULL DEFAULT 'SUGGEST',
ADD COLUMN     "ghostDays" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "ignoredUserKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "shadowHours" INTEGER NOT NULL DEFAULT 24,
ADD COLUMN     "userDailyRetentionDays" INTEGER NOT NULL DEFAULT 90;

-- AlterTable
ALTER TABLE "assets" ADD COLUMN     "lastSeenByAgentAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "endpoints" ADD COLUMN     "assetId" UUID,
ADD COLUMN     "biosSerial" TEXT,
ADD COLUMN     "chassisType" TEXT,
ADD COLUMN     "diskTotalBytes" BIGINT,
ADD COLUMN     "hardwareModel" TEXT,
ADD COLUMN     "loggedOnUser" TEXT,
ADD COLUMN     "manufacturer" TEXT,
ADD COLUMN     "mergedIntoId" UUID,
ADD COLUMN     "ramTotalBytes" BIGINT,
ADD COLUMN     "reviewState" "ReviewState" NOT NULL DEFAULT 'UNREVIEWED',
ADD COLUMN     "softwareHash" TEXT,
ADD COLUMN     "systemUuid" TEXT;

-- CreateTable
CREATE TABLE "reconciliation_suggestions" (
    "id" UUID NOT NULL,
    "kind" "SuggestionKind" NOT NULL,
    "endpointId" UUID NOT NULL,
    "assetId" UUID,
    "targetUserId" UUID,
    "targetLocationId" UUID,
    "mergeIntoEndpointId" UUID,
    "score" INTEGER NOT NULL,
    "signal" "MatchSignal",
    "shift" TEXT,
    "evidence" JSONB NOT NULL,
    "evidenceHash" TEXT NOT NULL,
    "state" "SuggestionState" NOT NULL DEFAULT 'PENDING',
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reconciliation_suggestions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "endpoint_user_daily" (
    "id" UUID NOT NULL,
    "endpointId" UUID NOT NULL,
    "userKey" TEXT NOT NULL,
    "userId" UUID,
    "day" DATE NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "samples" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "endpoint_user_daily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_changes" (
    "id" UUID NOT NULL,
    "assetId" UUID NOT NULL,
    "endpointId" UUID,
    "field" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_changes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "software_packages" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "publisher" TEXT,
    "normalizedKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "software_packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "software_installations" (
    "id" UUID NOT NULL,
    "endpointId" UUID NOT NULL,
    "packageId" UUID NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt" TIMESTAMP(3),

    CONSTRAINT "software_installations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "license_software" (
    "id" UUID NOT NULL,
    "licenseId" UUID NOT NULL,
    "packageId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" UUID,

    CONSTRAINT "license_software_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_usage_daily" (
    "id" UUID NOT NULL,
    "assetId" UUID NOT NULL,
    "day" DATE NOT NULL,
    "activeMinutes" INTEGER NOT NULL DEFAULT 0,
    "samples" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "asset_usage_daily_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reconciliation_suggestions_state_kind_idx" ON "reconciliation_suggestions"("state", "kind");

-- CreateIndex
CREATE INDEX "reconciliation_suggestions_endpointId_state_idx" ON "reconciliation_suggestions"("endpointId", "state");

-- CreateIndex
CREATE INDEX "reconciliation_suggestions_assetId_idx" ON "reconciliation_suggestions"("assetId");

-- CreateIndex
CREATE INDEX "endpoint_user_daily_endpointId_day_idx" ON "endpoint_user_daily"("endpointId", "day");

-- CreateIndex
CREATE INDEX "endpoint_user_daily_userId_day_idx" ON "endpoint_user_daily"("userId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "endpoint_user_daily_endpointId_userKey_day_key" ON "endpoint_user_daily"("endpointId", "userKey", "day");

-- CreateIndex
CREATE INDEX "asset_changes_assetId_detectedAt_idx" ON "asset_changes"("assetId", "detectedAt");

-- CreateIndex
CREATE UNIQUE INDEX "software_packages_normalizedKey_key" ON "software_packages"("normalizedKey");

-- CreateIndex
CREATE INDEX "software_packages_name_idx" ON "software_packages"("name");

-- CreateIndex
CREATE INDEX "software_installations_endpointId_removedAt_idx" ON "software_installations"("endpointId", "removedAt");

-- CreateIndex
CREATE INDEX "software_installations_packageId_removedAt_idx" ON "software_installations"("packageId", "removedAt");

-- CreateIndex
CREATE UNIQUE INDEX "software_installations_endpointId_packageId_key" ON "software_installations"("endpointId", "packageId");

-- CreateIndex
CREATE INDEX "license_software_packageId_idx" ON "license_software"("packageId");

-- CreateIndex
CREATE UNIQUE INDEX "license_software_licenseId_packageId_key" ON "license_software"("licenseId", "packageId");

-- CreateIndex
CREATE INDEX "asset_usage_daily_assetId_day_idx" ON "asset_usage_daily"("assetId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "asset_usage_daily_assetId_day_key" ON "asset_usage_daily"("assetId", "day");

-- CreateIndex
CREATE INDEX "assets_lastSeenByAgentAt_idx" ON "assets"("lastSeenByAgentAt");

-- CreateIndex
CREATE UNIQUE INDEX "endpoints_assetId_key" ON "endpoints"("assetId");

-- CreateIndex
CREATE INDEX "endpoints_assetId_idx" ON "endpoints"("assetId");

-- CreateIndex
CREATE INDEX "endpoints_reviewState_idx" ON "endpoints"("reviewState");

-- AddForeignKey
ALTER TABLE "endpoints" ADD CONSTRAINT "endpoints_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "endpoints" ADD CONSTRAINT "endpoints_mergedIntoId_fkey" FOREIGN KEY ("mergedIntoId") REFERENCES "endpoints"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reconciliation_suggestions" ADD CONSTRAINT "reconciliation_suggestions_endpointId_fkey" FOREIGN KEY ("endpointId") REFERENCES "endpoints"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reconciliation_suggestions" ADD CONSTRAINT "reconciliation_suggestions_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reconciliation_suggestions" ADD CONSTRAINT "reconciliation_suggestions_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reconciliation_suggestions" ADD CONSTRAINT "reconciliation_suggestions_targetLocationId_fkey" FOREIGN KEY ("targetLocationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reconciliation_suggestions" ADD CONSTRAINT "reconciliation_suggestions_mergeIntoEndpointId_fkey" FOREIGN KEY ("mergeIntoEndpointId") REFERENCES "endpoints"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "endpoint_user_daily" ADD CONSTRAINT "endpoint_user_daily_endpointId_fkey" FOREIGN KEY ("endpointId") REFERENCES "endpoints"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "endpoint_user_daily" ADD CONSTRAINT "endpoint_user_daily_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_changes" ADD CONSTRAINT "asset_changes_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_changes" ADD CONSTRAINT "asset_changes_endpointId_fkey" FOREIGN KEY ("endpointId") REFERENCES "endpoints"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "software_installations" ADD CONSTRAINT "software_installations_endpointId_fkey" FOREIGN KEY ("endpointId") REFERENCES "endpoints"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "software_installations" ADD CONSTRAINT "software_installations_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "software_packages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "license_software" ADD CONSTRAINT "license_software_licenseId_fkey" FOREIGN KEY ("licenseId") REFERENCES "licenses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "license_software" ADD CONSTRAINT "license_software_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "software_packages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_usage_daily" ADD CONSTRAINT "asset_usage_daily_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- O QUE O PRISMA NÃO EXPRESSA — e por isso é escrito à mão
-- ---------------------------------------------------------------------------

-- A CONVERSÃO DE `status`, no lugar do DROP + ADD que o gerador propôs.
--
-- O `USING` FALHA se alguma linha tiver valor fora do enum — e falhar é o
-- comportamento certo: melhor a migração parar do que converter para o default.
-- Conferir antes, e é uma linha:
--     SELECT DISTINCT status FROM endpoints;
--
-- O DEFAULT é derrubado e recriado em volta porque o Postgres recusa converter
-- o tipo de uma coluna cujo default é texto.
ALTER TABLE "endpoints" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "endpoints" ALTER COLUMN "status" TYPE "AgentStatus" USING "status"::"AgentStatus";
ALTER TABLE "endpoints" ALTER COLUMN "status" SET DEFAULT 'ONLINE';

-- UMA SUGESTÃO PENDENTE POR (TIPO, ENDPOINT, ALVO).
--
-- O job de reconciliação roda de hora em hora sobre a frota inteira. Sem este
-- índice ele empilha a mesma sugestão 24 vezes por dia, e a fila que deveria ser
-- lida por uma pessoa vira uma lista que ninguém abre duas vezes.
--
-- PARCIAL (`WHERE state = 'PENDING'`) porque o histórico PRECISA repetir: a
-- mesma sugestão pode ter sido recusada em março, substituída em abril e aceita
-- em maio, e as três linhas contam essa história.
--
-- COALESCE porque quatro das FKs de alvo são nuláveis e, num índice único do
-- Postgres, NULL não colide com NULL — sem isso, duas sugestões de LINK para o
-- mesmo par (as duas com `targetUserId` nulo) passariam as duas.
CREATE UNIQUE INDEX "sugestao_pendente_por_alvo"
  ON "reconciliation_suggestions" (
    "kind",
    "endpointId",
    COALESCE("assetId",             '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE("targetUserId",        '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE("targetLocationId",    '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE("mergeIntoEndpointId", '00000000-0000-0000-0000-000000000000'::uuid)
  )
  WHERE "state" = 'PENDING';
