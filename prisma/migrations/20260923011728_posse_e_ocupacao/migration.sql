-- POSSE E OCUPAÇÃO — docs/MODELO-POSSE.md (D14, D15, D16)
--
-- Duas tabelas novas, nenhuma coluna alterada: migration puramente ADITIVA.
-- Nenhuma linha existente é tocada, e o `assets.assignedToId` continua como
-- está (o que muda é QUEM escreve nele, que é código, não schema).
--
-- REVISADO À MÃO em dois pontos:
--
--   1. O `migrate diff` emitiu `ALTER TYPE "StatusLabelType" ADD VALUE 'IN_USE'`
--      porque o banco de desenvolvimento ainda não tinha o valor — a migration
--      `20260923003100_status_em_uso` estava PENDENTE. O bloco foi REMOVIDO
--      daqui: aquela migration tem timestamp menor, roda antes, e o faz na
--      posição certa (`AFTER 'DEPLOYABLE'`). Deixar os dois quebraria o deploy
--      no segundo com "enum label already exists".
--
--   2. Os dois índices únicos PARCIAIS no fim não saem do `migrate diff` —
--      o Prisma não expressa `WHERE` em `@@unique`. São eles que carregam as
--      duas invariantes do modelo, então entram à mão. É o mesmo caso de
--      `assets.assetTag`, `assets.serial` e `users.email`.

-- CreateEnum
CREATE TYPE "AssignmentTarget" AS ENUM ('USER', 'ASSET', 'LOCATION');

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

-- ---------------------------------------------------------------------------
-- AS DUAS INVARIANTES DO MODELO DE POSSE
--
-- Vivem no BANCO, não na aplicação, pelo mesmo motivo das outras unicidades
-- parciais do projeto: o esquecimento de uma checagem deixa de ser possível.
-- ---------------------------------------------------------------------------

-- Um ativo tem NO MÁXIMO UMA posse aberta. É o que impede duplo checkout.
--
-- Este índice é também a alavanca da decisão de cardinalidade: o dia que N
-- detentores simultâneos for necessário, DERRUBAR ESTE ÍNDICE é a mudança —
-- não reescrever a camada (docs/MODELO-POSSE.md).
CREATE UNIQUE INDEX "assignments_um_aberto_por_ativo"
  ON "assignments"("assetId") WHERE "checkinAt" IS NULL;

-- A mesma pessoa não ocupa o mesmo posto duas vezes ao mesmo tempo.
-- Sem isto, "Laura na Mesa 1" cadastrado duas vezes duplicaria a Laura na
-- lista de responsáveis de todo ativo daquela mesa.
CREATE UNIQUE INDEX "location_occupants_um_aberto_por_pessoa_local"
  ON "location_occupants"("locationId", "userId") WHERE "endedAt" IS NULL;
