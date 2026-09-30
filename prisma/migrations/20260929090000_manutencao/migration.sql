-- ---------------------------------------------------------------------------
-- MANUTENÇÃO — docs/FASE-8-PLANO-ITAM.md, Etapa A
--
-- Escrita À MÃO, e não pelo `migrate diff`, porque o banco de desenvolvimento
-- não estava de pé no momento do commit. O que o gerador faria está aqui na
-- ordem dele: enum, tabela, índices, FKs — e nada além disso, porque a etapa é
-- puramente ADITIVA (uma tabela nova e duas FKs).
--
-- SEM `deletedAt`, de propósito: histórico é append-only, e a coluna ligaria a
-- `softDeleteExtension` numa tabela que ninguém quer escopada. O preço é que
-- toda consulta que soma custo filtra `asset.deletedAt IS NULL` à mão (D8).
-- ---------------------------------------------------------------------------

-- CreateEnum
CREATE TYPE "MaintenanceType" AS ENUM ('MANUTENCAO', 'REPARO', 'UPGRADE', 'CALIBRACAO', 'SUPORTE');

-- CreateTable
CREATE TABLE "maintenances" (
    "id" UUID NOT NULL,
    "assetId" UUID NOT NULL,
    "supplierId" UUID,
    "type" "MaintenanceType" NOT NULL,
    "title" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "completionDate" TIMESTAMP(3),
    "cost" DECIMAL(12,2),
    "isWarranty" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "maintenances_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "maintenances_assetId_startDate_idx" ON "maintenances"("assetId", "startDate");

-- CreateIndex: o total EM ABERTO da tela global é `completionDate IS NULL`.
CREATE INDEX "maintenances_completionDate_idx" ON "maintenances"("completionDate");

-- CreateIndex
CREATE INDEX "maintenances_supplierId_idx" ON "maintenances"("supplierId");

-- AddForeignKey
ALTER TABLE "maintenances" ADD CONSTRAINT "maintenances_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: `RESTRICT` é a rede embaixo do 409 do `countUsages` — mesmo que
-- a checagem da aplicação seja esquecida, o banco recusa e o P2003 vira 409.
ALTER TABLE "maintenances" ADD CONSTRAINT "maintenances_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
