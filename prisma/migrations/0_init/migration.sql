-- ---------------------------------------------------------------------------
-- O ESQUEMA INTEIRO, NUMA MIGRAÇÃO SÓ.
--
-- As 39 migrations anteriores contavam a história de onze fases e de um
-- de-escopo; depois do corte para ITAM + RMM, metade delas criava tabela que a
-- seguinte apagava. Não existe banco deste projeto fora da máquina de
-- desenvolvimento, então o histórico não protege ninguém — e um `init` só é o
-- que um banco novo precisa.
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
CREATE TYPE "CategoryType" AS ENUM ('ASSET', 'LICENSE');

-- CreateEnum
CREATE TYPE "StatusLabelType" AS ENUM ('DEPLOYABLE', 'IN_USE', 'PENDING', 'ARCHIVED', 'UNDEPLOYABLE');

-- CreateEnum
CREATE TYPE "RetiredReason" AS ENUM ('VENDIDO', 'DESCARTADO', 'DOADO', 'EXTRAVIADO', 'ROUBADO', 'GARANTIA');

-- CreateEnum
CREATE TYPE "AssignmentTarget" AS ENUM ('USER', 'ASSET', 'LOCATION');

-- CreateEnum
CREATE TYPE "DiscoveryMode" AS ENUM ('OFF', 'SUGGEST', 'ON');

-- CreateEnum
CREATE TYPE "MatchSignal" AS ENUM ('SERIAL', 'UUID', 'MAC', 'HOSTNAME');

-- CreateEnum
CREATE TYPE "SuggestionKind" AS ENUM ('LINK', 'MERGE', 'CHECKOUT', 'OCCUPANCY', 'SHARED_POST');

-- CreateEnum
CREATE TYPE "SuggestionState" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'SUPERSEDED');

-- CreateTable
CREATE TABLE "endpoints" (
    "id" UUID NOT NULL,
    "hwid" TEXT NOT NULL,
    "hostname" TEXT NOT NULL,
    "osVersion" TEXT NOT NULL,
    "status" "AgentStatus" NOT NULL DEFAULT 'ONLINE',
    "lastSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cpuModel" TEXT,
    "installedSoftware" JSONB,
    "localIp" TEXT,
    "macAddress" TEXT,
    "biosSerial" TEXT,
    "systemUuid" TEXT,
    "manufacturer" TEXT,
    "hardwareModel" TEXT,
    "chassisType" TEXT,
    "ramTotalBytes" BIGINT,
    "diskTotalBytes" BIGINT,
    "loggedOnUser" TEXT,
    "softwareHash" TEXT,
    "softwareNormalizedHash" TEXT,
    "reviewState" "ReviewState" NOT NULL DEFAULT 'UNREVIEWED',
    "assetId" UUID,
    "mergedIntoId" UUID,

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
    "byod" BOOLEAN NOT NULL DEFAULT false,
    "requestable" BOOLEAN NOT NULL DEFAULT false,
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
    "targetAssetId" UUID,
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
    "userDailyRetentionDays" INTEGER NOT NULL DEFAULT 90,
    "ignoredUserKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
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
CREATE UNIQUE INDEX "endpoints_hwid_key" ON "endpoints"("hwid");

-- CreateIndex
CREATE UNIQUE INDEX "endpoints_assetId_key" ON "endpoints"("assetId");

-- CreateIndex
CREATE INDEX "endpoints_assetId_idx" ON "endpoints"("assetId");

-- CreateIndex
CREATE INDEX "endpoints_reviewState_idx" ON "endpoints"("reviewState");

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
CREATE INDEX "assignments_targetAssetId_checkinAt_idx" ON "assignments"("targetAssetId", "checkinAt");

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

-- AddForeignKey
ALTER TABLE "endpoints" ADD CONSTRAINT "endpoints_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "endpoints" ADD CONSTRAINT "endpoints_mergedIntoId_fkey" FOREIGN KEY ("mergedIntoId") REFERENCES "endpoints"("id") ON DELETE SET NULL ON UPDATE CASCADE;

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
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_targetAssetId_fkey" FOREIGN KEY ("targetAssetId") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

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


-- ═══════════════════════════════════════════════════════════════════════════
-- O QUE O PRISMA NÃO EXPRESSA, E O PROJETO DEPENDE: índices PARCIAIS e CHECKs.
--
-- Tudo abaixo foi escrito à mão nas migrations originais (as 39 que este `init`
-- substitui) e está aqui porque `migrate diff --from-schema-datamodel` não
-- emite nenhum dos dois. Perder este bloco é perder metade das invariantes de
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
-- `COALESCE` com o uuid zero porque em Postgres dois `NULL` nunca colidem num
-- índice único: sem ele, a mesma sugestão de vínculo entraria N vezes.
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

-- ── INVARIANTE 5: A FORMA DA POSSE — três CHECKs ──────────────────────────
--
-- 1. O ALVO É UM, E É O QUE O DISCRIMINANTE DIZ. As duas metades são
--    necessárias: sem a primeira, `USER` com duas FKs passaria; sem a segunda,
--    `USER` com só `targetLocationId` passaria.
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_alvo_coerente" CHECK (
  num_nonnulls("targetUserId", "targetAssetId", "targetLocationId") = 1
  AND (
       ("targetType" = 'USER'     AND "targetUserId"     IS NOT NULL)
    OR ("targetType" = 'ASSET'    AND "targetAssetId"    IS NOT NULL)
    OR ("targetType" = 'LOCATION' AND "targetLocationId" IS NOT NULL)
  )
);

-- 2. UM ATIVO NÃO É ENTREGUE A SI MESMO — um ciclo de tamanho 1, que a Camada 3
--    resolve como "sem responsável" sobre uma posse que existe.
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_nao_entregue_a_si_mesmo" CHECK (
  "targetAssetId" IS NULL OR "targetAssetId" <> "assetId"
);

-- 3. A DEVOLUÇÃO NÃO ANTECEDE A ENTREGA. `>=` e não `>`: entrega e devolução no
--    mesmo instante é real.
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
