-- POSTOS, DESCOMISSIONAMENTO E AUTENTICAÇÃO
--
-- Migration ADITIVA: só colunas novas, todas com default ou nuláveis. Nenhuma
-- linha existente é reescrita e nenhum backfill é necessário.
--
-- REVISADO À MÃO: o índice único PARCIAL de `users.username` no fim não sai do
-- `migrate diff` — o Prisma não expressa `WHERE` em `@@unique`. É o mesmo caso
-- de `users.email`, `assets.assetTag` e `assets.serial`.

-- CreateEnum
CREATE TYPE "RetiredReason" AS ENUM ('VENDIDO', 'DESCARTADO', 'DOADO', 'EXTRAVIADO', 'ROUBADO', 'GARANTIA');

-- AlterTable
ALTER TABLE "assets" ADD COLUMN     "retiredAt" TIMESTAMP(3),
ADD COLUMN     "retiredReason" "RetiredReason";

-- AlterTable
ALTER TABLE "locations" ADD COLUMN     "isWorkstation" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "lockedUntil" TIMESTAMP(3),
ADD COLUMN     "passwordHash" TEXT,
ADD COLUMN     "terminatedAt" TIMESTAMP(3),
ADD COLUMN     "username" TEXT;

-- ---------------------------------------------------------------------------
-- Login único ENTRE OS VIVOS.
--
-- Parcial, e não `@unique` comum, pelo mesmo motivo de `users.email`: um
-- usuário na lixeira travaria para sempre o recadastro do mesmo login — é o
-- `unique_undeleted` do Snipe-IT (D8 / F0).
--
-- Vários `username` NULOS convivem: o Postgres trata NULL como distinto, e é o
-- que permite colaborador sem acesso ao sistema, que é a maioria.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX "users_username_unique_undeleted"
  ON "users"("username") WHERE "deletedAt" IS NULL AND "username" IS NOT NULL;

-- A tela de postos filtra por esta coluna a cada carga.
CREATE INDEX "locations_isWorkstation_idx" ON "locations"("isWorkstation");

-- Relatório de descomissionados e exclusão deles das listagens do dia a dia.
CREATE INDEX "assets_retiredAt_idx" ON "assets"("retiredAt");
