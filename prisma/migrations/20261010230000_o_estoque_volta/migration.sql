-- O ESTOQUE VOLTA — um item por quantidade, e a movimentação dele.
--
-- Ativo é computador. Monitor, teclado, mouse, cabo e dock são ESTOQUE: N
-- unidades intercambiáveis de um `StockItem`, sem etiqueta nem série
-- individual. Cada unidade que sai é uma linha de `StockMovement` de SAIDA;
-- ENTRADA e BAIXA mudam o total do item.
--
-- O item NÃO tem coluna de saldo: o disponível é `qty − COUNT(saídas
-- abertas)`, calculado num helper só (docs/decisoes/estoque.md, D34).
--
-- `CategoryType` ganha STOCK: a categoria do item é do módulo dele, como a de
-- licença é de licença. O seed passa a criar "Monitor" e "Periférico" como
-- categorias de ESTOQUE; as que já existem como categorias de ativo num banco
-- antigo ficam, porque `(name, type)` é a chave e o seed não apaga nada.
--
-- GERADA COM `migrate diff` (nunca `migrate dev`), e com o bloco do fim
-- escrito à mão: o índice parcial e os CHECKs que o Prisma não expressa.

-- CreateEnum
CREATE TYPE "StockMovementKind" AS ENUM ('ENTRADA', 'BAIXA', 'SAIDA');

-- CreateEnum
CREATE TYPE "StockTarget" AS ENUM ('USER', 'LOCATION');

-- AlterEnum
ALTER TYPE "CategoryType" ADD VALUE 'STOCK';

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
ALTER TABLE "stock_items" ADD CONSTRAINT "stock_items_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "stock_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_targetLocationId_fkey" FOREIGN KEY ("targetLocationId") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ═══════════════════════════════════════════════════════════════════════════
-- O QUE O PRISMA NÃO EXPRESSA, E O ESTOQUE DEPENDE.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── O NOME É ÚNICO ENTRE OS VIVOS (o `unique_undeleted` de novo) ──────────
--
-- Com `@unique` comum, um item na lixeira travaria para sempre o recadastro do
-- mesmo nome. O `WHERE` é o que deixa a lixeira fora do índice.
CREATE UNIQUE INDEX "stock_items_name_unique_undeleted"
  ON "stock_items"("name") WHERE "deletedAt" IS NULL;

-- ── A FORMA DO MOVIMENTO ───────────────────────────────────────────────────
--
-- Nenhum movimento move zero ou menos.
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_qty_positiva"
  CHECK ("qty" > 0);

-- A SAIDA é UMA unidade com exatamente UM alvo, o que o discriminante diz.
-- ENTRADA e BAIXA não têm alvo nem devolução. As duas metades do alvo são
-- necessárias: sem a primeira, `USER` com duas FKs passaria; sem a segunda,
-- `USER` com só `targetLocationId` passaria. A aplicação recusa antes, com a
-- frase que ensina o modelo; o CHECK é a rede para quem não passa por ela.
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_forma" CHECK (
  (
    "kind" = 'SAIDA'
    AND "qty" = 1
    AND num_nonnulls("targetUserId", "targetLocationId") = 1
    AND (
         ("targetType" = 'USER'     AND "targetUserId"     IS NOT NULL)
      OR ("targetType" = 'LOCATION' AND "targetLocationId" IS NOT NULL)
    )
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
