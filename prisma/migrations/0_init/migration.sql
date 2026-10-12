-- ---------------------------------------------------------------------------
-- O ESQUEMA INTEIRO, NUMA MIGRAÇÃO SÓ — segunda rodada do squash.
--
-- O primeiro `init` (798a3aa) substituiu 39 migrations que contavam onze
-- fases e um de-escopo. Desde então o schema recebeu mais oito migrations —
-- a reconciliação deixou de olhar pessoa, o software instalado e a fusão de
-- máquinas saíram, byod/requestable saíram, a telemetria ganhou índice, o
-- alvo ASSET saiu da posse, e o estoque voltou como StockItem + StockMovement
-- (com uma correção de CHECK). Nenhuma delas é história de banco em produção:
-- não existe banco deste projeto fora da máquina de desenvolvimento, e um
-- `init` só é o que um banco novo precisa.
--
-- GERADA COM `migrate diff --from-empty --to-schema-datamodel` (nunca
-- `migrate dev`, que é interativo e falha neste ambiente — ver
-- docs/guias/criar-uma-migration.md), e com o bloco do fim escrito à mão.
-- ---------------------------------------------------------------------------

-- CreateEnum
CREATE TYPE "AgentStatus" AS ENUM ('ONLINE', 'OFFLINE');

-- CreateEnum
CREATE TYPE "ReviewState" AS ENUM ('UNREVIEWED', 'ALLOWED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "Papel" AS ENUM ('USUARIO', 'TECNICO', 'ADMIN');

-- CreateEnum
CREATE TYPE "CategoryType" AS ENUM ('ASSET', 'LICENSE', 'STOCK');

-- CreateEnum
CREATE TYPE "StatusLabelType" AS ENUM ('DEPLOYABLE', 'IN_USE', 'PENDING', 'ARCHIVED', 'UNDEPLOYABLE');

-- CreateEnum
CREATE TYPE "RetiredReason" AS ENUM ('VENDIDO', 'DESCARTADO', 'DOADO', 'EXTRAVIADO', 'ROUBADO', 'GARANTIA');

-- CreateEnum
CREATE TYPE "AssignmentTarget" AS ENUM ('USER', 'LOCATION');

-- CreateEnum
CREATE TYPE "DiscoveryMode" AS ENUM ('OFF', 'SUGGEST', 'ON');

-- CreateEnum
CREATE TYPE "MatchSignal" AS ENUM ('SERIAL', 'UUID', 'HOSTNAME');

-- CreateEnum
CREATE TYPE "SuggestionKind" AS ENUM ('LINK');

-- CreateEnum
CREATE TYPE "SuggestionState" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "StockMovementKind" AS ENUM ('ENTRADA', 'BAIXA', 'SAIDA');

-- CreateEnum
CREATE TYPE "StockTarget" AS ENUM ('USER', 'LOCATION');

-- CreateTable
CREATE TABLE "endpoints" (
    "id" UUID NOT NULL,
    "hwid" TEXT NOT NULL,
    "hostname" TEXT NOT NULL,
    "osVersion" TEXT NOT NULL,
    "status" "AgentStatus" NOT NULL DEFAULT 'ONLINE',
    "lastSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cpuModel" TEXT,
    "localIp" TEXT,
    "macAddress" TEXT,
    "biosSerial" TEXT,
    "systemUuid" TEXT,
    "manufacturer" TEXT,
    "hardwareModel" TEXT,
    "chassisType" TEXT,
    "ramTotalBytes" BIGINT,
    "diskTotalBytes" BIGINT,
    "reviewState" "ReviewState" NOT NULL DEFAULT 'UNREVIEWED',
    "assetId" UUID,

    CONSTRAINT "endpoints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telemetries" (
    "id" UUID NOT NULL,
    "endpointId" UUID NOT NULL,
    "cpuUsage" DOUBLE PRECISION NOT NULL,
    "ramTotal" BIGINT NOT NULL,
    "ramUsed" BIGINT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disks" JSONB,
    "network" JSONB,
    "topProcesses" JSONB,

    CONSTRAINT "telemetries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "username" TEXT,
    "passwordHash" TEXT,
    "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "tokenVersion" INTEGER NOT NULL DEFAULT 0,
    "lastLoginAt" TIMESTAMP(3),
    "employeeNumber" TEXT,
    "jobTitle" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "hiredAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "role" "Papel" NOT NULL DEFAULT 'USUARIO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_logs" (
    "id" UUID NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "changes" JSONB,
    "actorId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" "CategoryType" NOT NULL,
    "color" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "status_labels" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" "StatusLabelType" NOT NULL,
    "color" TEXT,
    "showInNav" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "status_labels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "manufacturers" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT,
    "supportPhone" TEXT,
    "supportEmail" TEXT,
    "supportUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "manufacturers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_models" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "modelNumber" TEXT,
    "notes" TEXT,
    "manufacturerId" UUID NOT NULL,
    "categoryId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "asset_models_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "locations" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" UUID,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "zip" TEXT,
    "phone" TEXT,
    "notes" TEXT,
    "isWorkstation" BOOLEAN NOT NULL DEFAULT false,
    "managerId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assets" (
    "id" UUID NOT NULL,
    "assetTag" TEXT NOT NULL,
    "serial" TEXT,
    "name" TEXT,
    "notes" TEXT,
    "statusId" UUID NOT NULL,
    "modelId" UUID NOT NULL,
    "locationId" UUID,
    "assignedToId" UUID,
    "orderNumber" TEXT,
    "purchaseDate" TIMESTAMP(3),
    "purchaseCost" DECIMAL(12,2),
    "retiredAt" TIMESTAMP(3),
    "retiredReason" "RetiredReason",
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "lastSeenByAgentAt" TIMESTAMP(3),

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignments" (
    "id" UUID NOT NULL,
    "assetId" UUID NOT NULL,
    "targetType" "AssignmentTarget" NOT NULL,
    "targetUserId" UUID,
    "targetLocationId" UUID,
    "checkoutAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expectedCheckinAt" TIMESTAMP(3),
    "checkinAt" TIMESTAMP(3),
    "checkoutNotes" TEXT,
    "checkinNotes" TEXT,
    "checkoutById" UUID,
    "checkinById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "location_occupants" (
    "id" UUID NOT NULL,
    "locationId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "shift" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "location_occupants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_runs" (
    "name" TEXT NOT NULL,
    "lastRunAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_runs_pkey" PRIMARY KEY ("name")
);

-- CreateTable
CREATE TABLE "app_settings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "assetTagPrefix" TEXT NOT NULL DEFAULT 'ATV-',
    "assetTagZerofill" INTEGER NOT NULL DEFAULT 5,
    "assetTagNext" INTEGER NOT NULL DEFAULT 1,
    "checkoutStatusId" UUID,
    "checkinStatusId" UUID,
    "discoveryMode" "DiscoveryMode" NOT NULL DEFAULT 'SUGGEST',
    "ghostDays" INTEGER NOT NULL DEFAULT 30,
    "shadowHours" INTEGER NOT NULL DEFAULT 24,
    "locale" TEXT NOT NULL DEFAULT 'pt-BR',
    "dateFormat" TEXT NOT NULL DEFAULT 'DD/MM/YYYY',
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "licenses" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "seatsTotal" INTEGER NOT NULL,
    "reassignable" BOOLEAN NOT NULL DEFAULT true,
    "maintained" BOOLEAN NOT NULL DEFAULT false,
    "expirationDate" TIMESTAMP(3),
    "terminationDate" TIMESTAMP(3),
    "licensedToName" TEXT,
    "licensedToEmail" TEXT,
    "minSeats" INTEGER,
    "categoryId" UUID NOT NULL,
    "manufacturerId" UUID,
    "orderNumber" TEXT,
    "purchaseDate" TIMESTAMP(3),
    "purchaseCost" DECIMAL(12,2),
    "notes" TEXT,
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "licenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "license_seats" (
    "id" UUID NOT NULL,
    "licenseId" UUID NOT NULL,
    "seatNumber" INTEGER NOT NULL,
    "burnedAt" TIMESTAMP(3),
    "retiredAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "license_seats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "license_seat_checkouts" (
    "id" UUID NOT NULL,
    "seatId" UUID NOT NULL,
    "assignedUserId" UUID,
    "assignedAssetId" UUID,
    "checkoutAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checkinAt" TIMESTAMP(3),
    "checkoutNotes" TEXT,
    "checkinNotes" TEXT,
    "checkoutById" UUID,
    "checkinById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "license_seat_checkouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reconciliation_suggestions" (
    "id" UUID NOT NULL,
    "kind" "SuggestionKind" NOT NULL,
    "endpointId" UUID NOT NULL,
    "assetId" UUID,
    "score" INTEGER NOT NULL,
    "signal" "MatchSignal",
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
CREATE TABLE "asset_usage_daily" (
    "id" UUID NOT NULL,
    "assetId" UUID NOT NULL,
    "day" DATE NOT NULL,
    "activeMinutes" INTEGER NOT NULL DEFAULT 0,
    "samples" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "asset_usage_daily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_items" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "categoryId" UUID NOT NULL,
    "notes" TEXT,
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "stock_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "kind" "StockMovementKind" NOT NULL,
    "qty" INTEGER NOT NULL,
    "targetType" "StockTarget",
    "targetUserId" UUID,
    "targetLocationId" UUID,
    "returnedAt" TIMESTAMP(3),
    "notes" TEXT,
    "returnNotes" TEXT,
    "createdById" UUID,
    "returnedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "endpoints_hwid_key" ON "endpoints"("hwid");

-- CreateIndex
CREATE UNIQUE INDEX "endpoints_assetId_key" ON "endpoints"("assetId");

-- CreateIndex
CREATE INDEX "endpoints_assetId_idx" ON "endpoints"("assetId");

-- CreateIndex
CREATE INDEX "endpoints_reviewState_idx" ON "endpoints"("reviewState");

-- CreateIndex
CREATE INDEX "telemetries_endpointId_timestamp_idx" ON "telemetries"("endpointId", "timestamp" DESC);

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_deletedAt_idx" ON "users"("deletedAt");

-- CreateIndex
CREATE INDEX "activity_logs_entityType_entityId_createdAt_idx" ON "activity_logs"("entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "activity_logs_createdAt_idx" ON "activity_logs"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "categories_name_type_key" ON "categories"("name", "type");

-- CreateIndex
CREATE UNIQUE INDEX "status_labels_name_key" ON "status_labels"("name");

-- CreateIndex
CREATE UNIQUE INDEX "manufacturers_name_key" ON "manufacturers"("name");

-- CreateIndex
CREATE INDEX "asset_models_categoryId_idx" ON "asset_models"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "asset_models_manufacturerId_modelNumber_key" ON "asset_models"("manufacturerId", "modelNumber");

-- CreateIndex
CREATE UNIQUE INDEX "locations_name_key" ON "locations"("name");

-- CreateIndex
CREATE INDEX "locations_parentId_idx" ON "locations"("parentId");

-- CreateIndex
CREATE INDEX "locations_isWorkstation_idx" ON "locations"("isWorkstation");

-- CreateIndex
CREATE INDEX "assets_deletedAt_idx" ON "assets"("deletedAt");

-- CreateIndex
CREATE INDEX "assets_statusId_idx" ON "assets"("statusId");

-- CreateIndex
CREATE INDEX "assets_modelId_idx" ON "assets"("modelId");

-- CreateIndex
CREATE INDEX "assets_locationId_idx" ON "assets"("locationId");

-- CreateIndex
CREATE INDEX "assets_assignedToId_idx" ON "assets"("assignedToId");

-- CreateIndex
CREATE INDEX "assets_retiredAt_idx" ON "assets"("retiredAt");

-- CreateIndex
CREATE INDEX "assets_lastSeenByAgentAt_idx" ON "assets"("lastSeenByAgentAt");

-- CreateIndex
CREATE INDEX "assignments_assetId_checkinAt_idx" ON "assignments"("assetId", "checkinAt");

-- CreateIndex
CREATE INDEX "assignments_targetUserId_checkinAt_idx" ON "assignments"("targetUserId", "checkinAt");

-- CreateIndex
CREATE INDEX "assignments_targetLocationId_checkinAt_idx" ON "assignments"("targetLocationId", "checkinAt");

-- CreateIndex
CREATE INDEX "location_occupants_locationId_endedAt_idx" ON "location_occupants"("locationId", "endedAt");

-- CreateIndex
CREATE INDEX "location_occupants_userId_endedAt_idx" ON "location_occupants"("userId", "endedAt");

-- CreateIndex
CREATE INDEX "licenses_deletedAt_idx" ON "licenses"("deletedAt");

-- CreateIndex
CREATE INDEX "licenses_categoryId_idx" ON "licenses"("categoryId");

-- CreateIndex
CREATE INDEX "licenses_expirationDate_idx" ON "licenses"("expirationDate");

-- CreateIndex
CREATE INDEX "license_seats_licenseId_idx" ON "license_seats"("licenseId");

-- CreateIndex
CREATE UNIQUE INDEX "license_seats_numero" ON "license_seats"("licenseId", "seatNumber");

-- CreateIndex
CREATE INDEX "license_seat_checkouts_seatId_checkinAt_idx" ON "license_seat_checkouts"("seatId", "checkinAt");

-- CreateIndex
CREATE INDEX "license_seat_checkouts_assignedUserId_checkinAt_idx" ON "license_seat_checkouts"("assignedUserId", "checkinAt");

-- CreateIndex
CREATE INDEX "license_seat_checkouts_assignedAssetId_checkinAt_idx" ON "license_seat_checkouts"("assignedAssetId", "checkinAt");

-- CreateIndex
CREATE INDEX "reconciliation_suggestions_state_kind_idx" ON "reconciliation_suggestions"("state", "kind");

-- CreateIndex
CREATE INDEX "reconciliation_suggestions_endpointId_state_idx" ON "reconciliation_suggestions"("endpointId", "state");

-- CreateIndex
CREATE INDEX "reconciliation_suggestions_assetId_idx" ON "reconciliation_suggestions"("assetId");

-- CreateIndex
CREATE INDEX "asset_changes_assetId_detectedAt_idx" ON "asset_changes"("assetId", "detectedAt");

-- CreateIndex
CREATE INDEX "asset_usage_daily_assetId_day_idx" ON "asset_usage_daily"("assetId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "asset_usage_daily_assetId_day_key" ON "asset_usage_daily"("assetId", "day");

-- CreateIndex
CREATE INDEX "stock_items_deletedAt_idx" ON "stock_items"("deletedAt");

-- CreateIndex
CREATE INDEX "stock_items_categoryId_idx" ON "stock_items"("categoryId");

-- CreateIndex
CREATE INDEX "stock_movements_itemId_kind_returnedAt_idx" ON "stock_movements"("itemId", "kind", "returnedAt");

-- CreateIndex
CREATE INDEX "stock_movements_itemId_createdAt_idx" ON "stock_movements"("itemId", "createdAt");

-- CreateIndex
CREATE INDEX "stock_movements_targetUserId_returnedAt_idx" ON "stock_movements"("targetUserId", "returnedAt");

-- CreateIndex
CREATE INDEX "stock_movements_targetLocationId_returnedAt_idx" ON "stock_movements"("targetLocationId", "returnedAt");

-- AddForeignKey
ALTER TABLE "endpoints" ADD CONSTRAINT "endpoints_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telemetries" ADD CONSTRAINT "telemetries_endpointId_fkey" FOREIGN KEY ("endpointId") REFERENCES "endpoints"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_models" ADD CONSTRAINT "asset_models_manufacturerId_fkey" FOREIGN KEY ("manufacturerId") REFERENCES "manufacturers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_models" ADD CONSTRAINT "asset_models_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "locations" ADD CONSTRAINT "locations_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "locations" ADD CONSTRAINT "locations_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_statusId_fkey" FOREIGN KEY ("statusId") REFERENCES "status_labels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "asset_models"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_targetLocationId_fkey" FOREIGN KEY ("targetLocationId") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "location_occupants" ADD CONSTRAINT "location_occupants_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "location_occupants" ADD CONSTRAINT "location_occupants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "licenses" ADD CONSTRAINT "licenses_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "licenses" ADD CONSTRAINT "licenses_manufacturerId_fkey" FOREIGN KEY ("manufacturerId") REFERENCES "manufacturers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "license_seats" ADD CONSTRAINT "license_seats_licenseId_fkey" FOREIGN KEY ("licenseId") REFERENCES "licenses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "license_seat_checkouts" ADD CONSTRAINT "license_seat_checkouts_seatId_fkey" FOREIGN KEY ("seatId") REFERENCES "license_seats"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "license_seat_checkouts" ADD CONSTRAINT "license_seat_checkouts_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "license_seat_checkouts" ADD CONSTRAINT "license_seat_checkouts_assignedAssetId_fkey" FOREIGN KEY ("assignedAssetId") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reconciliation_suggestions" ADD CONSTRAINT "reconciliation_suggestions_endpointId_fkey" FOREIGN KEY ("endpointId") REFERENCES "endpoints"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reconciliation_suggestions" ADD CONSTRAINT "reconciliation_suggestions_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_changes" ADD CONSTRAINT "asset_changes_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_changes" ADD CONSTRAINT "asset_changes_endpointId_fkey" FOREIGN KEY ("endpointId") REFERENCES "endpoints"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_usage_daily" ADD CONSTRAINT "asset_usage_daily_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_items" ADD CONSTRAINT "stock_items_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "stock_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_targetLocationId_fkey" FOREIGN KEY ("targetLocationId") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;



-- ═══════════════════════════════════════════════════════════════════════════
-- O QUE O PRISMA NÃO EXPRESSA, E O PROJETO DEPENDE: índices PARCIAIS e CHECKs.
--
-- Tudo abaixo foi escrito à mão nas migrations originais (as 39 que o
-- primeiro `init` substituiu, mais as oito que vieram depois dele) e está
-- aqui porque `migrate diff --from-schema-datamodel` não emite nenhum dos
-- dois. Perder este bloco é perder metade das invariantes de
-- `docs/referencia/invariantes.md` — o banco deixa de GARANTIR e sobra só a
-- aplicação EXPLICANDO.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── UNICIDADE QUE IGNORA A LIXEIRA (o `unique_undeleted` do Snipe-IT) ──────
--
-- Com `@unique` comum, uma linha na lixeira travaria para sempre o recadastro
-- do mesmo valor. O `WHERE` é o que deixa a lixeira fora do índice.
CREATE UNIQUE INDEX "users_email_unique_undeleted"
  ON "users"("email") WHERE "deletedAt" IS NULL;

CREATE UNIQUE INDEX "users_username_unique_undeleted"
  ON "users"("username") WHERE "deletedAt" IS NULL AND "username" IS NOT NULL;

CREATE UNIQUE INDEX "users_employeeNumber_unico_ativo"
  ON "users"("employeeNumber") WHERE "employeeNumber" IS NOT NULL AND "deletedAt" IS NULL;

CREATE UNIQUE INDEX "assets_assetTag_unique_undeleted"
  ON "assets"("assetTag") WHERE "deletedAt" IS NULL;

CREATE UNIQUE INDEX "assets_serial_unique_undeleted"
  ON "assets"("serial") WHERE "deletedAt" IS NULL;

CREATE UNIQUE INDEX "licenses_name_unico_ativo"
  ON "licenses"("name") WHERE "deletedAt" IS NULL;

CREATE UNIQUE INDEX "stock_items_name_unique_undeleted"
  ON "stock_items"("name") WHERE "deletedAt" IS NULL;

-- ── INVARIANTE 1: UMA POSSE ABERTA POR ATIVO (D14) ────────────────────────
--
-- O duplo checkout é P2002 do banco traduzido em 409 pelo error-handler, e não
-- validação que alguém pode esquecer de chamar.
CREATE UNIQUE INDEX "assignments_um_aberto_por_ativo"
  ON "assignments"("assetId") WHERE "checkinAt" IS NULL;

-- ── INVARIANTE 2: UMA OCUPAÇÃO ABERTA POR (POSTO, PESSOA) ─────────────────
CREATE UNIQUE INDEX "location_occupants_um_aberto_por_pessoa_local"
  ON "location_occupants"("locationId", "userId") WHERE "endedAt" IS NULL;

-- ── INVARIANTE 10: UM ASSENTO NÃO ESTÁ EM DUAS MÃOS (D40) ─────────────────
CREATE UNIQUE INDEX "license_seat_uma_aberta_por_assento"
  ON "license_seat_checkouts"("seatId") WHERE "checkinAt" IS NULL;

-- ── INVARIANTE 13: A MESMA SUGESTÃO NÃO EMPILHA NA FILA ───────────────────
--
-- UM alvo só, desde que a fusão de máquinas saiu e com ela o segundo alvo
-- (`mergeIntoEndpointId`) que o COALESCE original cobria. `COALESCE` continua
-- porque em Postgres dois `NULL` nunca colidem num índice único — uma linha
-- `PENDING` com `assetId` nulo voltaria a poder empilhar sem limite.
CREATE UNIQUE INDEX "sugestao_pendente_por_alvo"
  ON "reconciliation_suggestions" (
    "kind",
    "endpointId",
    COALESCE("assetId", '00000000-0000-0000-0000-000000000000'::uuid)
  )
  WHERE "state" = 'PENDING';

-- ── INVARIANTE 5: A FORMA DA POSSE — dois CHECKs ──────────────────────────
--
-- O alvo é UM, pessoa OU posto — não há mais alvo `ASSET` (K): um computador
-- não é entregue a outro. As duas metades são necessárias: sem a primeira,
-- `USER` com duas FKs passaria; sem a segunda, `USER` com só
-- `targetLocationId` passaria.
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_alvo_coerente" CHECK (
  num_nonnulls("targetUserId", "targetLocationId") = 1
  AND (
       ("targetType" = 'USER'     AND "targetUserId"     IS NOT NULL)
    OR ("targetType" = 'LOCATION' AND "targetLocationId" IS NOT NULL)
  )
);

-- A DEVOLUÇÃO NÃO ANTECEDE A ENTREGA. `>=` e não `>`: entrega e devolução no
-- mesmo instante é real.
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_devolucao_nao_antecede_entrega" CHECK (
  "checkinAt" IS NULL OR "checkinAt" >= "checkoutAt"
);

-- ── INVARIANTE 9: O ALVO DO ASSENTO É UM — pessoa XOR ativo (D39) ─────────
ALTER TABLE "license_seat_checkouts" ADD CONSTRAINT "license_seat_alvo_xor"
  CHECK (num_nonnulls("assignedUserId", "assignedAssetId") = 1);

ALTER TABLE "license_seat_checkouts" ADD CONSTRAINT "license_seat_checkin_nao_antecede"
  CHECK ("checkinAt" IS NULL OR "checkinAt" >= "checkoutAt");

-- ── O CONTRATO NÃO É NEGATIVO, E O ASSENTO É NUMERADO A PARTIR DE 1 ───────
ALTER TABLE "licenses"      ADD CONSTRAINT "licenses_seats_nao_negativo"  CHECK ("seatsTotal" >= 0);
ALTER TABLE "license_seats" ADD CONSTRAINT "license_seat_numero_positivo" CHECK ("seatNumber" >= 1);

-- ── O ESTOQUE: A FORMA DO MOVIMENTO (docs/decisoes/estoque.md, J) ─────────
--
-- Nenhum movimento move zero ou menos, e o total nunca fica negativo por um
-- caminho que não seja a aplicação recusando antes.
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_qty_positiva"
  CHECK ("qty" > 0);

ALTER TABLE "stock_items" ADD CONSTRAINT "stock_items_qty_nao_negativa"
  CHECK ("qty" >= 0);

-- A SAIDA é UMA unidade com exatamente UM alvo, o que o discriminante diz —
-- `targetType IS NOT NULL` explícito no ramo da SAIDA, porque a coluna é
-- nulável aqui (ENTRADA e BAIXA não têm alvo) e sem isso a comparação
-- `"targetType" = 'USER'` com NULL vira NULL em vez de FALSE, e CHECK só
-- recusa FALSE. ENTRADA e BAIXA não têm alvo nem devolução. A nota e o autor
-- da devolução só existem com `returnedAt` preenchido.
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_forma" CHECK (
  (
    "kind" = 'SAIDA'
    AND "qty" = 1
    AND "targetType" IS NOT NULL
    AND num_nonnulls("targetUserId", "targetLocationId") = 1
    AND (
         ("targetType" = 'USER'     AND "targetUserId"     IS NOT NULL)
      OR ("targetType" = 'LOCATION' AND "targetLocationId" IS NOT NULL)
    )
    AND ("returnedAt" IS NOT NULL OR ("returnNotes" IS NULL AND "returnedById" IS NULL))
  ) OR (
    "kind" <> 'SAIDA'
    AND "targetType" IS NULL
    AND "targetUserId" IS NULL
    AND "targetLocationId" IS NULL
    AND "returnedAt" IS NULL
    AND "returnNotes" IS NULL
    AND "returnedById" IS NULL
  )
);

-- A DEVOLUÇÃO NÃO ANTECEDE A SAÍDA. `>=` e não `>`: saída e devolução no mesmo
-- instante é real.
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_devolucao_nao_antecede_saida"
  CHECK ("returnedAt" IS NULL OR "returnedAt" >= "createdAt");
