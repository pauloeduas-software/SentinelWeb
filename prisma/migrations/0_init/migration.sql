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
CREATE TYPE "Cargo" AS ENUM ('ADMIN');

-- CreateEnum
CREATE TYPE "AuditActorType" AS ENUM ('USER', 'SYSTEM', 'ANONYMOUS');

-- CreateEnum
CREATE TYPE "CategoryType" AS ENUM ('ASSET', 'LICENSE', 'STOCK', 'COMPONENT', 'CONSUMABLE');

-- CreateEnum
CREATE TYPE "StatusLabelType" AS ENUM ('DEPLOYABLE', 'IN_USE', 'PENDING', 'UNDEPLOYABLE');

-- CreateEnum
CREATE TYPE "RetiredReason" AS ENUM ('VENDIDO', 'DESCARTADO', 'DOADO', 'EXTRAVIADO', 'ROUBADO', 'GARANTIA');

-- CreateEnum
CREATE TYPE "AssignmentTarget" AS ENUM ('PERSON', 'WORKSTATION');

-- CreateEnum
CREATE TYPE "DiscoveryMode" AS ENUM ('OFF', 'SUGGEST', 'ON');

-- CreateEnum
CREATE TYPE "MatchSignal" AS ENUM ('SERIAL', 'UUID', 'HOSTNAME');

-- CreateEnum
CREATE TYPE "SuggestionKind" AS ENUM ('LINK');

-- CreateEnum
CREATE TYPE "SuggestionState" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'SUPERSEDED');

-- CreateEnum

-- CreateEnum
CREATE TYPE "StockTarget" AS ENUM ('PERSON', 'WORKSTATION', 'ASSET');

-- CreateEnum
CREATE TYPE "StockReturnKind" AS ENUM ('RETURNED', 'CONSUMED');

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
    "passwordHash" TEXT NOT NULL,
    "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "tokenVersion" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "role" "Cargo" NOT NULL DEFAULT 'ADMIN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "people" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "people_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" UUID,
    "entityLabel" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "changes" JSONB,
    "actorType" "AuditActorType" NOT NULL,
    "actorId" UUID,
    "actorName" TEXT,
    "actorEmail" TEXT,
    "source" TEXT NOT NULL,
    "requestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" "CategoryType" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "status_labels" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" "StatusLabelType" NOT NULL,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
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
    "isActive" BOOLEAN NOT NULL DEFAULT true,
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
    "isActive" BOOLEAN NOT NULL DEFAULT true,
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
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "zip" TEXT,
    "phone" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workstations" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "locationId" UUID NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workstations_pkey" PRIMARY KEY ("id")
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
    "orderNumber" TEXT,
    "purchaseDate" TIMESTAMP(3),
    "purchaseCost" DECIMAL(12,2),
    "retiredAt" TIMESTAMP(3),
    "retiredReason" "RetiredReason",
    "retiredNotes" TEXT,
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
    "targetPersonId" UUID,
    "targetWorkstationId" UUID,
    "targetWorkstationName" TEXT,
    "checkoutAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expectedCheckinAt" TIMESTAMP(3),
    "checkinAt" TIMESTAMP(3),
    "checkoutNotes" TEXT,
    "checkinNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workstation_occupants" (
    "id" UUID NOT NULL,
    "workstationId" UUID,
    "personId" UUID NOT NULL,
    "workstationName" TEXT,
    "shift" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workstation_occupants_pkey" PRIMARY KEY ("id")
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
    "discoveryMode" "DiscoveryMode" NOT NULL DEFAULT 'SUGGEST',
    "ghostDays" INTEGER NOT NULL DEFAULT 30,
    "shadowHours" INTEGER NOT NULL DEFAULT 24,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "licenses" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "seatsTotal" INTEGER NOT NULL,
    "expirationDate" TIMESTAMP(3),
    "terminationDate" TIMESTAMP(3),
    "licensedToName" TEXT,
    "licensedToEmail" TEXT,
    "categoryId" UUID NOT NULL,
    "manufacturerId" UUID,
    "orderNumber" TEXT,
    "purchaseDate" TIMESTAMP(3),
    "purchaseCost" DECIMAL(12,2),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "licenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "license_keys" (
    "id" UUID NOT NULL,
    "licenseId" UUID NOT NULL,
    "productKey" TEXT NOT NULL,
    "seats" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "license_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "license_checkouts" (
    "id" UUID NOT NULL,
    "licenseId" UUID,
    "licenseName" TEXT,
    "assignedPersonId" UUID,
    "assignedAssetId" UUID,
    "checkoutAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checkinAt" TIMESTAMP(3),
    "checkoutNotes" TEXT,
    "licenseKeyId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "license_checkouts_pkey" PRIMARY KEY ("id")
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reconciliation_suggestions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_changes" (
    "id" UUID NOT NULL,
    "assetId" UUID NOT NULL,
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

    CONSTRAINT "asset_usage_daily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_items" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "categoryId" UUID NOT NULL,
    "notes" TEXT,
    "locationId" UUID,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" UUID NOT NULL,
    "itemId" UUID,
    "itemName" TEXT,
    "targetType" "StockTarget" NOT NULL,
    "targetPersonId" UUID,
    "targetWorkstationId" UUID,
    "targetWorkstationName" TEXT,
    "targetAssetId" UUID,
    "checkoutAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "returnedAt" TIMESTAMP(3),
    "returnRecordedAt" TIMESTAMP(3),
    "returnKind" "StockReturnKind",
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "endpoints_hwid_key" ON "endpoints"("hwid");

-- CreateIndex
CREATE UNIQUE INDEX "endpoints_assetId_key" ON "endpoints"("assetId");

-- CreateIndex
CREATE INDEX "endpoints_reviewState_idx" ON "endpoints"("reviewState");

-- CreateIndex
CREATE INDEX "telemetries_endpointId_timestamp_idx" ON "telemetries"("endpointId", "timestamp" DESC);

-- CreateIndex
CREATE INDEX "telemetries_timestamp_idx" ON "telemetries"("timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "people_deletedAt_idx" ON "people"("deletedAt");

-- CreateIndex
CREATE INDEX "audit_logs_entityId_createdAt_idx" ON "audit_logs"("entityId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_actorEmail_createdAt_idx" ON "audit_logs"("actorEmail", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_actorId_createdAt_idx" ON "audit_logs"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_entityLabel_idx" ON "audit_logs"("entityLabel");

-- CreateIndex
CREATE INDEX "audit_logs_requestId_idx" ON "audit_logs"("requestId");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

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
CREATE UNIQUE INDEX "workstations_name_key" ON "workstations"("name");

-- CreateIndex
CREATE INDEX "workstations_locationId_idx" ON "workstations"("locationId");

-- CreateIndex
CREATE INDEX "assets_deletedAt_idx" ON "assets"("deletedAt");

-- CreateIndex
CREATE INDEX "assets_statusId_idx" ON "assets"("statusId");

-- CreateIndex
CREATE INDEX "assets_modelId_idx" ON "assets"("modelId");

-- CreateIndex
CREATE INDEX "assets_locationId_idx" ON "assets"("locationId");

-- CreateIndex
CREATE INDEX "assets_retiredAt_idx" ON "assets"("retiredAt");

-- CreateIndex
CREATE INDEX "assets_lastSeenByAgentAt_idx" ON "assets"("lastSeenByAgentAt");

-- CreateIndex
CREATE INDEX "assignments_assetId_checkinAt_idx" ON "assignments"("assetId", "checkinAt");

-- CreateIndex
CREATE INDEX "assignments_targetPersonId_checkinAt_idx" ON "assignments"("targetPersonId", "checkinAt");

-- CreateIndex
CREATE INDEX "assignments_targetWorkstationId_checkinAt_idx" ON "assignments"("targetWorkstationId", "checkinAt");

-- CreateIndex
CREATE INDEX "workstation_occupants_workstationId_endedAt_idx" ON "workstation_occupants"("workstationId", "endedAt");

-- CreateIndex
CREATE INDEX "workstation_occupants_personId_endedAt_idx" ON "workstation_occupants"("personId", "endedAt");

-- CreateIndex
CREATE INDEX "licenses_categoryId_idx" ON "licenses"("categoryId");

-- CreateIndex
CREATE INDEX "licenses_manufacturerId_idx" ON "licenses"("manufacturerId");

-- CreateIndex
CREATE INDEX "licenses_expirationDate_idx" ON "licenses"("expirationDate");

-- CreateIndex
CREATE INDEX "licenses_terminationDate_idx" ON "licenses"("terminationDate");

-- CreateIndex
CREATE UNIQUE INDEX "license_keys_licenseId_productKey_key" ON "license_keys"("licenseId", "productKey");

-- CreateIndex
CREATE UNIQUE INDEX "license_keys_id_licenseId_key" ON "license_keys"("id", "licenseId");

-- CreateIndex
CREATE INDEX "license_checkouts_licenseId_checkinAt_idx" ON "license_checkouts"("licenseId", "checkinAt");

-- CreateIndex
CREATE INDEX "license_checkouts_licenseKeyId_checkinAt_idx" ON "license_checkouts"("licenseKeyId", "checkinAt");

-- CreateIndex
CREATE INDEX "license_checkouts_assignedPersonId_checkinAt_idx" ON "license_checkouts"("assignedPersonId", "checkinAt");

-- CreateIndex
CREATE INDEX "license_checkouts_assignedAssetId_checkinAt_idx" ON "license_checkouts"("assignedAssetId", "checkinAt");

-- CreateIndex
CREATE INDEX "reconciliation_suggestions_state_kind_idx" ON "reconciliation_suggestions"("state", "kind");

-- CreateIndex
CREATE INDEX "reconciliation_suggestions_endpointId_state_idx" ON "reconciliation_suggestions"("endpointId", "state");

-- CreateIndex
CREATE INDEX "reconciliation_suggestions_assetId_idx" ON "reconciliation_suggestions"("assetId");

-- CreateIndex
CREATE INDEX "asset_changes_assetId_detectedAt_idx" ON "asset_changes"("assetId", "detectedAt");

-- CreateIndex
CREATE UNIQUE INDEX "asset_usage_daily_assetId_day_key" ON "asset_usage_daily"("assetId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "stock_items_name_key" ON "stock_items"("name");

-- CreateIndex
CREATE INDEX "stock_items_isActive_idx" ON "stock_items"("isActive");

-- CreateIndex
CREATE INDEX "stock_items_categoryId_idx" ON "stock_items"("categoryId");

-- CreateIndex
CREATE INDEX "stock_items_locationId_idx" ON "stock_items"("locationId");

-- CreateIndex
CREATE INDEX "stock_movements_itemId_returnedAt_idx" ON "stock_movements"("itemId", "returnedAt");

-- CreateIndex
CREATE INDEX "stock_movements_itemId_checkoutAt_idx" ON "stock_movements"("itemId", "checkoutAt");

-- CreateIndex
CREATE INDEX "stock_movements_targetPersonId_returnedAt_idx" ON "stock_movements"("targetPersonId", "returnedAt");

-- CreateIndex
CREATE INDEX "stock_movements_targetWorkstationId_returnedAt_idx" ON "stock_movements"("targetWorkstationId", "returnedAt");

-- CreateIndex
CREATE INDEX "stock_movements_targetAssetId_returnedAt_idx" ON "stock_movements"("targetAssetId", "returnedAt");

-- AddForeignKey
ALTER TABLE "endpoints" ADD CONSTRAINT "endpoints_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telemetries" ADD CONSTRAINT "telemetries_endpointId_fkey" FOREIGN KEY ("endpointId") REFERENCES "endpoints"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_models" ADD CONSTRAINT "asset_models_manufacturerId_fkey" FOREIGN KEY ("manufacturerId") REFERENCES "manufacturers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_models" ADD CONSTRAINT "asset_models_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workstations" ADD CONSTRAINT "workstations_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_statusId_fkey" FOREIGN KEY ("statusId") REFERENCES "status_labels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "asset_models"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_targetPersonId_fkey" FOREIGN KEY ("targetPersonId") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_targetWorkstationId_fkey" FOREIGN KEY ("targetWorkstationId") REFERENCES "workstations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workstation_occupants" ADD CONSTRAINT "workstation_occupants_workstationId_fkey" FOREIGN KEY ("workstationId") REFERENCES "workstations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workstation_occupants" ADD CONSTRAINT "workstation_occupants_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "licenses" ADD CONSTRAINT "licenses_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "licenses" ADD CONSTRAINT "licenses_manufacturerId_fkey" FOREIGN KEY ("manufacturerId") REFERENCES "manufacturers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "license_keys" ADD CONSTRAINT "license_keys_licenseId_fkey" FOREIGN KEY ("licenseId") REFERENCES "licenses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "license_checkouts" ADD CONSTRAINT "license_checkouts_licenseId_fkey" FOREIGN KEY ("licenseId") REFERENCES "licenses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "license_checkouts" ADD CONSTRAINT "license_checkouts_assignedPersonId_fkey" FOREIGN KEY ("assignedPersonId") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "license_checkouts" ADD CONSTRAINT "license_checkouts_assignedAssetId_fkey" FOREIGN KEY ("assignedAssetId") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "license_checkouts" ADD CONSTRAINT "license_checkouts_licenseKeyId_licenseId_fkey" FOREIGN KEY ("licenseKeyId", "licenseId") REFERENCES "license_keys"("id", "licenseId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "reconciliation_suggestions" ADD CONSTRAINT "reconciliation_suggestions_endpointId_fkey" FOREIGN KEY ("endpointId") REFERENCES "endpoints"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reconciliation_suggestions" ADD CONSTRAINT "reconciliation_suggestions_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_changes" ADD CONSTRAINT "asset_changes_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_usage_daily" ADD CONSTRAINT "asset_usage_daily_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_items" ADD CONSTRAINT "stock_items_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_items" ADD CONSTRAINT "stock_items_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "stock_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_targetPersonId_fkey" FOREIGN KEY ("targetPersonId") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_targetWorkstationId_fkey" FOREIGN KEY ("targetWorkstationId") REFERENCES "workstations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_targetAssetId_fkey" FOREIGN KEY ("targetAssetId") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

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
-- do mesmo valor. O `WHERE` é o que deixa a lixeira fora do índice. O e-mail
-- do usuário não está aqui: usuário não tem lixeira, e o índice dele é o
-- `@unique` comum, na metade gerada.

-- O e-mail do colaborador é opcional: dois `NULL` nunca colidem num índice
-- único, então o `WHERE` só precisa deixar a lixeira de fora.
CREATE UNIQUE INDEX "people_email_unique_undeleted"
  ON "people"("email") WHERE "deletedAt" IS NULL;

CREATE UNIQUE INDEX "assets_assetTag_unique_undeleted"
  ON "assets"("assetTag") WHERE "deletedAt" IS NULL;

CREATE UNIQUE INDEX "assets_serial_unique_undeleted"
  ON "assets"("serial") WHERE "deletedAt" IS NULL;

-- ── INVARIANTE 1: UMA POSSE ABERTA POR ATIVO (D14) ────────────────────────
--
-- O duplo checkout é P2002 do banco traduzido em 409 pelo error-handler, e não
-- validação que alguém pode esquecer de chamar.
CREATE UNIQUE INDEX "assignments_um_aberto_por_ativo"
  ON "assignments"("assetId") WHERE "checkinAt" IS NULL;

-- ── INVARIANTE 2: UMA OCUPAÇÃO ABERTA POR (POSTO, PESSOA) ─────────────────
CREATE UNIQUE INDEX "workstation_occupants_um_aberto_por_pessoa_posto"
  ON "workstation_occupants"("workstationId", "personId") WHERE "endedAt" IS NULL;

-- A ocupação ABERTA aponta sempre para o posto; só a encerrada de um posto
-- excluído fica sem ele — e então com o nome por escrito (`workstationName`).
ALTER TABLE "workstation_occupants" ADD CONSTRAINT "workstation_occupants_posto_presente" CHECK (
  "workstationId" IS NOT NULL OR ("endedAt" IS NOT NULL AND "workstationName" IS NOT NULL)
);

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
-- não é entregue a outro. Cada ramo diz qual FK está preenchida e que a outra
-- está vazia: sem isso, `PERSON` com duas FKs, ou `PERSON` com só
-- `targetWorkstationId`, passariam.
--
-- O POSTO EXCLUÍDO é a única posse sem FK nenhuma: o posto segue a regra do
-- status e sai quando nada está nele agora. A posse JÁ DEVOLVIDA perde a
-- ligação e guarda o nome por escrito (`targetWorkstationName`) — e só ela: a
-- aberta aponta sempre para o posto.
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_alvo_coerente" CHECK (
     ("targetType" = 'PERSON' AND "targetPersonId" IS NOT NULL AND "targetWorkstationId" IS NULL)
  OR ("targetType" = 'WORKSTATION' AND "targetPersonId" IS NULL AND (
          "targetWorkstationId" IS NOT NULL
       OR ("checkinAt" IS NOT NULL AND "targetWorkstationName" IS NOT NULL)
     ))
);

-- A DEVOLUÇÃO NÃO ANTECEDE A ENTREGA. `>=` e não `>`: entrega e devolução no
-- mesmo instante é real.
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_devolucao_nao_antecede_entrega" CHECK (
  "checkinAt" IS NULL OR "checkinAt" >= "checkoutAt"
);

-- ── INVARIANTE 9: A FORMA DA ENTREGA DE LICENÇA (D39, AA) ─────────────────
--
-- O alvo é UM, pessoa XOR ativo — nunca posto.
ALTER TABLE "license_checkouts" ADD CONSTRAINT "license_checkouts_alvo_xor"
  CHECK (num_nonnulls("assignedPersonId", "assignedAssetId") = 1);

-- A DEVOLUÇÃO NÃO ANTECEDE A ENTREGA. `>=` e não `>`, como na posse.
ALTER TABLE "license_checkouts" ADD CONSTRAINT "license_checkouts_devolucao_nao_antecede"
  CHECK ("checkinAt" IS NULL OR "checkinAt" >= "checkoutAt");

-- A LICENÇA EXCLUÍDA (AG): só a entrega JÁ DEVOLVIDA fica sem ela, com o nome
-- por escrito e sem a chave — as chaves vão junto com a licença, e a FK
-- composta, com `licenseId` nulo, não conferiria mais de quem a chave é.
ALTER TABLE "license_checkouts" ADD CONSTRAINT "license_checkouts_licenca_presente" CHECK (
  "licenseId" IS NOT NULL
  OR ("checkinAt" IS NOT NULL AND "licenseName" IS NOT NULL AND "licenseKeyId" IS NULL)
);

-- ── INVARIANTE 23: UMA ENTREGA ABERTA POR ALVO E LICENÇA (AA) ─────────────
--
-- Dois índices, um por alvo: com uma coluna nula no par, o Postgres nunca
-- acusaria colisão. O `IS NOT NULL` deixa cada índice só com o seu alvo.
CREATE UNIQUE INDEX "license_checkouts_uma_aberta_por_pessoa"
  ON "license_checkouts"("licenseId", "assignedPersonId")
  WHERE "checkinAt" IS NULL AND "assignedPersonId" IS NOT NULL;

CREATE UNIQUE INDEX "license_checkouts_uma_aberta_por_ativo"
  ON "license_checkouts"("licenseId", "assignedAssetId")
  WHERE "checkinAt" IS NULL AND "assignedAssetId" IS NOT NULL;

-- ── INVARIANTE 24: A CHAVE DA ENTREGA É DA LICENÇA, E COBRE AO MENOS UMA (AC) ─
--
-- Que a chave é DA PRÓPRIA licença, a FK composta (`licenseKeyId`, `licenseId`)
-- já garante, lá em cima. Aqui, a forma da chave: cobre ao menos uma licença,
-- e não é vazia. Quantas entregas abertas cada chave tem, e quanto as chaves
-- somam contra o comprado, cruzam tabelas — são da aplicação, sob a trava da
-- licença.
ALTER TABLE "license_keys" ADD CONSTRAINT "license_keys_seats_positivo" CHECK ("seats" >= 1);

ALTER TABLE "license_keys" ADD CONSTRAINT "license_keys_chave_preenchida" CHECK (btrim("productKey") <> '');

-- ── O CONTRATO: AO MENOS UMA, E AS DATAS NÃO ANTECEDEM A COMPRA ───────────
--
-- Zero não é contrato: a licença que acabou se encerra. As datas só se comparam
-- quando as duas estão preenchidas, e o encerramento não se compara com o
-- vencimento — dá para encerrar antes do fim do período pago.
ALTER TABLE "licenses" ADD CONSTRAINT "licenses_seats_positivo" CHECK ("seatsTotal" >= 1);

ALTER TABLE "licenses" ADD CONSTRAINT "licenses_vencimento_nao_antecede_compra" CHECK (
  "purchaseDate" IS NULL OR "expirationDate" IS NULL OR "expirationDate" >= "purchaseDate"
);

ALTER TABLE "licenses" ADD CONSTRAINT "licenses_encerramento_nao_antecede_compra" CHECK (
  "purchaseDate" IS NULL OR "terminationDate" IS NULL OR "terminationDate" >= "purchaseDate"
);

-- ── O ESTOQUE: A FORMA DA ENTREGA (docs/decisoes/estoque.md, J, AE e AJ) ──
--
-- O total é o que existe, e nunca negativo. O cadastro pede ao menos 1 (a
-- aplicação); depois ele chega a 0 quando acaba — a unidade que recebeu baixa
-- ou foi consumida sai dele (AJ).
ALTER TABLE "stock_items" ADD CONSTRAINT "stock_items_qty_nao_negativa"
  CHECK ("qty" >= 0);

-- Cada linha é UMA unidade com exatamente UM alvo, o que o discriminante diz.
-- A entrega JÁ DEVOLVIDA para um posto excluído fica sem FK, com o nome por
-- escrito — como na `Assignment`. O computador (o componente, AI) não tem
-- essa saída: ele não se exclui, vai para a lixeira.
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_forma" CHECK (
     ("targetType" = 'PERSON' AND "targetPersonId" IS NOT NULL AND "targetWorkstationId" IS NULL
      AND "targetAssetId" IS NULL)
  OR ("targetType" = 'WORKSTATION' AND "targetPersonId" IS NULL AND "targetAssetId" IS NULL AND (
          "targetWorkstationId" IS NOT NULL
       OR ("returnedAt" IS NOT NULL AND "targetWorkstationName" IS NOT NULL)
     ))
  OR ("targetType" = 'ASSET' AND "targetAssetId" IS NOT NULL AND "targetPersonId" IS NULL
      AND "targetWorkstationId" IS NULL)
);

-- O ITEM EXCLUÍDO (AG): só a entrega JÁ DEVOLVIDA fica sem ele, com o nome por
-- escrito — a regra do posto. A que está em uso aponta sempre para o item.
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_item_presente" CHECK (
  "itemId" IS NOT NULL OR ("returnedAt" IS NOT NULL AND "itemName" IS NOT NULL)
);

-- A DEVOLUÇÃO NÃO ANTECEDE A ENTREGA. `>=` e não `>`: entrega e devolução no mesmo
-- instante é real.
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_devolucao_nao_antecede_entrega"
  CHECK ("returnedAt" IS NULL OR "returnedAt" >= "checkoutAt");

-- A DEVOLUÇÃO REGISTRADA: o dia e o instante do registro andam juntos — os dois
-- nulos (em uso) ou os dois preenchidos. O instante é a chave da devolução: o
-- dia passado é sempre o meio-dia, e duas devoluções no mesmo dia viravam uma.
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_devolucao_registrada"
  CHECK (("returnedAt" IS NULL) = ("returnRecordedAt" IS NULL));

-- COMO SAIU ANDA COM A DEVOLUÇÃO (AJ): a unidade em uso não tem, e a que saiu
-- tem sempre — devolvida ou consumida.
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_fechamento_com_devolucao"
  CHECK (("returnedAt" IS NULL) = ("returnKind" IS NULL));

-- ── A AUDITORIA: O AUTOR COERENTE E A LINHA QUE NÃO SE REESCREVE (AB) ─────
--
-- A linha de uma conta diz qual conta, por escrito, e de qual requisição; a do
-- sistema não tem conta nenhuma — nem nome, nem requisição. O login sem sessão
-- (senha errada, conta bloqueada) tem só a requisição: quem digitou não provou
-- ser a conta. Sem isto, um autor pela metade passaria por linha de auditoria
-- válida, e o que ela existe para provar é justamente quem. Texto em branco
-- conta como ausente: `''` e `'   '` não são um nome — `~ '\S'` exige ao
-- menos um caractere que não seja espaço, tabulação ou quebra de linha.
-- `IS NOT NULL` explícito ao lado de cada `~`, porque `NULL ~ '\S'` dá NULL
-- e CHECK só recusa FALSE.
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_autor_coerente" CHECK (
  (
    "actorType" = 'USER'
    AND "actorId" IS NOT NULL
    AND "actorName" IS NOT NULL AND "actorName" ~ '\S'
    AND "actorEmail" IS NOT NULL AND "actorEmail" ~ '\S'
    AND "requestId" IS NOT NULL AND "requestId" ~ '\S'
  ) OR (
    "actorType" = 'SYSTEM'
    AND "actorId" IS NULL
    AND "actorName" IS NULL
    AND "actorEmail" IS NULL
    AND "requestId" IS NULL
  ) OR (
    "actorType" = 'ANONYMOUS'
    AND "actorId" IS NULL
    AND "actorName" IS NULL
    AND "actorEmail" IS NULL
    AND "requestId" IS NOT NULL AND "requestId" ~ '\S'
  )
);

-- O registro e a origem por escrito também não ficam em branco: são por eles
-- que o administrador procura.
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_registro_por_escrito" CHECK (
  "entityLabel" ~ '\S' AND "source" ~ '\S'
);

-- O registro sem id só onde não há registro: a configuração da descoberta, que
-- é uma linha só, e a rodada de reconciliação. Em todo o resto, o id é o que
-- segue o registro renomeado.
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_registro_com_id" CHECK (
  "entityId" IS NOT NULL OR "entityType" IN ('AppSetting', 'Reconciliation')
);

-- A linha não se altera nem se apaga. O trigger barra o UPDATE e o DELETE
-- comuns — os do Prisma e os de SQL à mão. Não barra quem é DONO da tabela e
-- decide desligá-lo (`DISABLE TRIGGER`) ou esvaziá-la (`TRUNCATE`), e o usuário
-- do banco da aplicação é o dono: nenhum código faz isso, mas a garantia é essa,
-- e não mais. O `TRUNCATE` do reset dos testes passa, porque trigger de linha
-- não dispara nele.
CREATE FUNCTION "audit_logs_imutavel"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs não se altera nem se apaga (AB)';
END;
$$;

CREATE TRIGGER "audit_logs_imutavel"
  BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION "audit_logs_imutavel"();
