-- ---------------------------------------------------------------------------
-- AUDITORIA FÍSICA — docs/FASE-8-PLANO-ITAM.md, Etapa B
--
-- Escrita à mão, aditiva. Três coisas que merecem o olho antes de aplicar:
--
--   1. `locationIdBefore` e `locationIdFound` NÃO TÊM FK, e é de propósito (é o
--      motivo do `ActivityLog.actorId`): conferência é append-only e não pode
--      depender do ciclo de vida da linha de `locations`. Com `SetNull`, apagar
--      uma sala apagaria a prova de que o ativo estava nela.
--
--   2. `assets.lastAuditAt` ganha índice. A consulta de "auditoria vencida" é
--      `lastAuditAt IS NULL OR lastAuditAt < :corte` sobre a frota inteira.
--
--   3. `auditIntervalMonths` e `auditWarningDays` nascem AQUI, não com os
--      alertas: elas são da auditoria, e o relatório da Etapa D as lê. Na Etapa
--      E o commit D não compilaria.
-- ---------------------------------------------------------------------------

-- CreateEnum
CREATE TYPE "AuditResult" AS ENUM ('OK', 'DIVERGENTE', 'NAO_LOCALIZADO');

-- CreateEnum
CREATE TYPE "AuditMethod" AS ENUM ('MANUAL', 'AGENTE');

-- AlterTable
ALTER TABLE "assets" ADD COLUMN     "lastAuditAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "app_settings" ADD COLUMN     "auditIntervalMonths" INTEGER NOT NULL DEFAULT 12,
ADD COLUMN     "auditWarningDays" INTEGER NOT NULL DEFAULT 30;

-- CreateTable
CREATE TABLE "audits" (
    "id" UUID NOT NULL,
    "assetId" UUID NOT NULL,
    "auditedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "result" "AuditResult" NOT NULL,
    "method" "AuditMethod" NOT NULL DEFAULT 'MANUAL',
    "locationIdBefore" UUID,
    "locationIdFound" UUID,
    "divergenciaDePosse" BOOLEAN NOT NULL DEFAULT false,
    "postoVago" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "auditedById" UUID,

    CONSTRAINT "audits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audits_assetId_auditedAt_idx" ON "audits"("assetId", "auditedAt");

-- CreateIndex
CREATE INDEX "audits_auditedAt_idx" ON "audits"("auditedAt");

-- CreateIndex
CREATE INDEX "assets_lastAuditAt_idx" ON "assets"("lastAuditAt");

-- AddForeignKey
ALTER TABLE "audits" ADD CONSTRAINT "audits_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
