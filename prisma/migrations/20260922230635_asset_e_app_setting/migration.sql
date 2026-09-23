-- DropForeignKey
ALTER TABLE "inventory_items" DROP CONSTRAINT "inventory_items_assignedToId_fkey";

-- DropTable
DROP TABLE "inventory_items";

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
    "supplierId" UUID,
    "assignedToId" UUID,
    "orderNumber" TEXT,
    "purchaseDate" TIMESTAMP(3),
    "purchaseCost" DECIMAL(12,2),
    "warrantyMonths" INTEGER,
    "warrantyExpiresAt" TIMESTAMP(3),
    "eolMonths" INTEGER,
    "eolDate" TIMESTAMP(3),
    "eolExplicit" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_settings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "assetTagPrefix" TEXT NOT NULL DEFAULT 'ATV-',
    "assetTagZerofill" INTEGER NOT NULL DEFAULT 5,
    "assetTagNext" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("id")
);

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

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_statusId_fkey" FOREIGN KEY ("statusId") REFERENCES "status_labels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "asset_models"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- ACRESCENTADO À MÃO: unicidade de etiqueta e série ENTRE OS VIVOS.
--
-- O Prisma não tem sintaxe para índice parcial, então `@unique` no schema criaria
-- unicidade sobre a tabela inteira — inclusive sobre a lixeira. Com isso, apagar
-- um ativo travaria para sempre o recadastro da mesma etiqueta, que é justamente
-- o que se faz ao trocar um equipamento e reaproveitar o número.
--
-- É o `unique_undeleted` do Snipe-IT, e o mesmo caso de `users.email` na Fase 0.
--
-- `serial` é nullable: o Postgres trata NULL como distinto, então vários ativos
-- sem número de série convivem sem violar o índice.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX "assets_assetTag_unique_undeleted"
  ON "assets" ("assetTag") WHERE "deletedAt" IS NULL;

CREATE UNIQUE INDEX "assets_serial_unique_undeleted"
  ON "assets" ("serial") WHERE "deletedAt" IS NULL;
