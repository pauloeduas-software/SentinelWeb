-- ESTOQUE: acessórios, consumíveis e componentes — docs/FASE-5-PLANO-ITAM.md
--
-- Seis tabelas, um enum, migração puramente ADITIVA: nenhuma coluna existente é
-- tocada e nenhuma linha se move. Não há dado a migrar — `inventory_items` foi
-- APAGADA na F1 (D12), e o item "migração do InventoryItem achatado" do TODO
-- ficou sem objeto. A prova é uma linha: `SELECT to_regclass('public.inventory_items')`
-- devolve NULL.
--
-- REVISADO À MÃO, e o que mudou depois do `migrate diff`:
--
--   1. As TRÊS unicidades parciais de `name` (`WHERE "deletedAt" IS NULL`). O
--      Prisma não expressa `WHERE` em `@@unique`, então elas entram aqui — o
--      mesmo caso de `assets.assetTag` e de `users.email`. Com `@unique` comum,
--      um acessório na lixeira travaria para sempre o recadastro do mesmo nome.
--
--   2. O CHECK do alvo do checkout (`accessory_checkout_alvo_xor`). Ele é a
--      diferença desta fase para o `Assignment`: lá a coerência entre o
--      discriminante e a FK preenchida é guarda de APLICAÇÃO
--      (`assertAlvoCoerente`), porque o CHECK não é expressável no schema do
--      Prisma e ficaria invisível. Aqui ele é do BANCO, e a aplicação valida
--      por cima — então `targetType: 'USER'` com `targetLocationId` preenchido
--      deixa de ser uma linha que o Postgres aceita em silêncio, mesmo vinda de
--      um `psql` ou do importador de CSV da F10.
--
--   3. O QUE **NÃO** ENTROU, e por quê: o plano previa três índices PARCIAIS a
--      mais (`("accessoryId") WHERE "checkedInAt" IS NULL` e os dois irmãos em
--      `component_assets`). Eles são redundantes com os compostos que o
--      `migrate diff` já emitiu acima — `("accessoryId", "checkedInAt")` cobre
--      `WHERE "accessoryId" = ? AND "checkedInAt" IS NULL` pelas duas colunas, e
--      ainda serve à listagem de movimentação do item, que o parcial não
--      serviria. Dois índices para o mesmo caminho de acesso é custo de escrita
--      em toda entrega, sem leitura mais rápida em lugar nenhum.

-- CreateEnum
CREATE TYPE "AccessoryTarget" AS ENUM ('USER', 'LOCATION');

-- CreateTable
CREATE TABLE "accessories" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "minQty" INTEGER,
    "modelNumber" TEXT,
    "categoryId" UUID NOT NULL,
    "manufacturerId" UUID,
    "supplierId" UUID,
    "locationId" UUID,
    "orderNumber" TEXT,
    "purchaseDate" TIMESTAMP(3),
    "purchaseCost" DECIMAL(12,2),
    "notes" TEXT,
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "accessories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accessory_checkouts" (
    "id" UUID NOT NULL,
    "accessoryId" UUID NOT NULL,
    "targetType" "AccessoryTarget" NOT NULL,
    "targetUserId" UUID,
    "targetLocationId" UUID,
    "checkedOutAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expectedCheckinAt" TIMESTAMP(3),
    "checkedInAt" TIMESTAMP(3),
    "checkoutNotes" TEXT,
    "checkinNotes" TEXT,
    "checkoutById" UUID,
    "checkinById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accessory_checkouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consumables" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "minQty" INTEGER,
    "modelNumber" TEXT,
    "categoryId" UUID NOT NULL,
    "manufacturerId" UUID,
    "supplierId" UUID,
    "locationId" UUID,
    "orderNumber" TEXT,
    "purchaseDate" TIMESTAMP(3),
    "purchaseCost" DECIMAL(12,2),
    "notes" TEXT,
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "consumables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consumable_checkouts" (
    "id" UUID NOT NULL,
    "consumableId" UUID NOT NULL,
    "userId" UUID,
    "userNameSnapshot" TEXT NOT NULL,
    "qty" INTEGER NOT NULL DEFAULT 1,
    "consumedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "consumedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consumable_checkouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "components" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "minQty" INTEGER,
    "modelNumber" TEXT,
    "serial" TEXT,
    "categoryId" UUID NOT NULL,
    "manufacturerId" UUID,
    "supplierId" UUID,
    "locationId" UUID,
    "orderNumber" TEXT,
    "purchaseDate" TIMESTAMP(3),
    "purchaseCost" DECIMAL(12,2),
    "notes" TEXT,
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "components_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "component_assets" (
    "id" UUID NOT NULL,
    "componentId" UUID NOT NULL,
    "assetId" UUID NOT NULL,
    "assignedQty" INTEGER NOT NULL,
    "attachedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "detachedAt" TIMESTAMP(3),
    "notes" TEXT,
    "attachedById" UUID,
    "detachedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "component_assets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "accessories_deletedAt_idx" ON "accessories"("deletedAt");

-- CreateIndex
CREATE INDEX "accessories_categoryId_idx" ON "accessories"("categoryId");

-- CreateIndex
CREATE INDEX "accessory_checkouts_accessoryId_checkedInAt_idx" ON "accessory_checkouts"("accessoryId", "checkedInAt");

-- CreateIndex
CREATE INDEX "accessory_checkouts_targetUserId_checkedInAt_idx" ON "accessory_checkouts"("targetUserId", "checkedInAt");

-- CreateIndex
CREATE INDEX "accessory_checkouts_targetLocationId_checkedInAt_idx" ON "accessory_checkouts"("targetLocationId", "checkedInAt");

-- CreateIndex
CREATE INDEX "consumables_deletedAt_idx" ON "consumables"("deletedAt");

-- CreateIndex
CREATE INDEX "consumables_categoryId_idx" ON "consumables"("categoryId");

-- CreateIndex
CREATE INDEX "consumable_checkouts_consumableId_idx" ON "consumable_checkouts"("consumableId");

-- CreateIndex
CREATE INDEX "consumable_checkouts_userId_idx" ON "consumable_checkouts"("userId");

-- CreateIndex
CREATE INDEX "components_deletedAt_idx" ON "components"("deletedAt");

-- CreateIndex
CREATE INDEX "components_categoryId_idx" ON "components"("categoryId");

-- CreateIndex
CREATE INDEX "component_assets_componentId_detachedAt_idx" ON "component_assets"("componentId", "detachedAt");

-- CreateIndex
CREATE INDEX "component_assets_assetId_detachedAt_idx" ON "component_assets"("assetId", "detachedAt");

-- AddForeignKey
ALTER TABLE "accessories" ADD CONSTRAINT "accessories_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accessories" ADD CONSTRAINT "accessories_manufacturerId_fkey" FOREIGN KEY ("manufacturerId") REFERENCES "manufacturers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accessories" ADD CONSTRAINT "accessories_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accessories" ADD CONSTRAINT "accessories_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accessory_checkouts" ADD CONSTRAINT "accessory_checkouts_accessoryId_fkey" FOREIGN KEY ("accessoryId") REFERENCES "accessories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accessory_checkouts" ADD CONSTRAINT "accessory_checkouts_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accessory_checkouts" ADD CONSTRAINT "accessory_checkouts_targetLocationId_fkey" FOREIGN KEY ("targetLocationId") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consumables" ADD CONSTRAINT "consumables_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consumables" ADD CONSTRAINT "consumables_manufacturerId_fkey" FOREIGN KEY ("manufacturerId") REFERENCES "manufacturers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consumables" ADD CONSTRAINT "consumables_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consumables" ADD CONSTRAINT "consumables_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consumable_checkouts" ADD CONSTRAINT "consumable_checkouts_consumableId_fkey" FOREIGN KEY ("consumableId") REFERENCES "consumables"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consumable_checkouts" ADD CONSTRAINT "consumable_checkouts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "components" ADD CONSTRAINT "components_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "components" ADD CONSTRAINT "components_manufacturerId_fkey" FOREIGN KEY ("manufacturerId") REFERENCES "manufacturers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "components" ADD CONSTRAINT "components_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "components" ADD CONSTRAINT "components_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "component_assets" ADD CONSTRAINT "component_assets_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "components"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "component_assets" ADD CONSTRAINT "component_assets_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;



-- ---------------------------------------------------------------------------
-- O QUE O PRISMA NÃO EXPRESSA — e por isso é escrito à mão
-- ---------------------------------------------------------------------------

-- NOME ÚNICO ENTRE OS VIVOS. O `unique_undeleted` do Snipe-IT, pela terceira
-- vez no projeto: sem o `WHERE`, um item na lixeira bloqueia para sempre o
-- recadastro do mesmo nome — e a lixeira aqui existe justamente para guardar o
-- histórico de consumo (D36), ou seja, ela é feita para ficar cheia.
CREATE UNIQUE INDEX "accessories_name_unico_ativo"
  ON "accessories"("name") WHERE "deletedAt" IS NULL;

CREATE UNIQUE INDEX "consumables_name_unico_ativo"
  ON "consumables"("name") WHERE "deletedAt" IS NULL;

CREATE UNIQUE INDEX "components_name_unico_ativo"
  ON "components"("name") WHERE "deletedAt" IS NULL;

-- O ALVO DA ENTREGA É UM SÓ — e quem garante é o BANCO.
--
-- Duas FKs nuláveis com um discriminante ao lado admitem quatro estados, e três
-- deles são mentira: as duas preenchidas, nenhuma preenchida, e a preenchida
-- que não corresponde ao `targetType`. Nenhum dá erro sozinho; o que acontece é
-- a resolução de responsáveis devolver `[]` em silêncio — "ninguém responde por
-- esta unidade" — para uma unidade que está na mão de alguém.
--
-- Isto é o CHECK que o `Assignment` não tem (lá a guarda é `assertAlvoCoerente`,
-- no use-case). A diferença prática: aqui a garantia alcança o `psql`, o
-- importador de CSV da F10 e qualquer caminho futuro que não passe pelo
-- use-case.
ALTER TABLE "accessory_checkouts" ADD CONSTRAINT "accessory_checkout_alvo_xor"
  CHECK (
       ("targetType" = 'USER'     AND "targetUserId"     IS NOT NULL AND "targetLocationId" IS NULL)
    OR ("targetType" = 'LOCATION' AND "targetLocationId" IS NOT NULL AND "targetUserId"     IS NULL)
  );

-- QUANTIDADE É POSITIVA — nas três colunas em que ela significa "unidades".
--
-- `qty = 0` é legítimo (item zerado, esperando compra); NEGATIVO não é. E
-- `assignedQty = 0` numa instalação seria uma linha que ocupa histórico sem
-- dizer que nada foi instalado — a devolução TOTAL fecha a linha, não abre uma
-- sucessora vazia (D38).
ALTER TABLE "accessories" ADD CONSTRAINT "accessories_qty_nao_negativa" CHECK ("qty" >= 0);
ALTER TABLE "consumables"  ADD CONSTRAINT "consumables_qty_nao_negativa"  CHECK ("qty" >= 0);
ALTER TABLE "components"   ADD CONSTRAINT "components_qty_nao_negativa"   CHECK ("qty" >= 0);

ALTER TABLE "consumable_checkouts" ADD CONSTRAINT "consumable_checkout_qty_positiva" CHECK ("qty" > 0);
ALTER TABLE "component_assets"     ADD CONSTRAINT "component_asset_qty_positiva"     CHECK ("assignedQty" > 0);
