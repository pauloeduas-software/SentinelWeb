-- StockLog: por que a QUANTIDADE NOMINAL mudou — Etapa D da F5.
--
-- Aditiva e sem revisão à mão: uma tabela nova, dois enums, um índice. O
-- `migrate diff` emitiu tudo, e não há índice parcial nem CHECK a acrescentar —
-- `delta = 0` já é recusado pelo zod (um ajuste de zero não muda nada), e um
-- CHECK para isso seria a mesma regra escrita duas vezes em lugares que
-- ninguém compara.
--
-- O que esta tabela NÃO guarda: para onde a unidade foi. Isso é linha em
-- `accessory_checkouts` / `consumable_checkouts` / `component_assets`, e
-- duplicá-lo aqui seria uma segunda contagem do mesmo fato (D34).

-- CreateEnum
CREATE TYPE "StockItemType" AS ENUM ('ACCESSORY', 'CONSUMABLE', 'COMPONENT');

-- CreateEnum
CREATE TYPE "StockAdjustReason" AS ENUM ('COMPRA', 'DEVOLUCAO_FORNECEDOR', 'QUEBRA', 'PERDA', 'RECONTAGEM', 'OUTRO');

-- CreateTable
CREATE TABLE "stock_logs" (
    "id" UUID NOT NULL,
    "itemType" "StockItemType" NOT NULL,
    "itemId" UUID NOT NULL,
    "delta" INTEGER NOT NULL,
    "reason" "StockAdjustReason" NOT NULL,
    "notes" TEXT,
    "actorId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stock_logs_itemType_itemId_createdAt_idx" ON "stock_logs"("itemType", "itemId", "createdAt");


-- ---------------------------------------------------------------------------
-- O AJUSTE É A ÚNICA PORTA PARA `qty` — e a prova disso não é SQL
--
-- Não há trigger nem CHECK impedindo um `UPDATE accessories SET qty = …`: uma
-- trava assim quebraria o próprio ajuste, que é quem tem o direito de escrever.
-- A garantia mora uma camada acima e é de AUSÊNCIA (docs/FASE-5-PLANO-ITAM.md):
-- `qty` não é chave declarada no schema de edição, então o `strictObject`
-- devolve 422 a quem a mande — sem checagem que alguém possa esquecer de
-- escrever no próximo schema.
-- ---------------------------------------------------------------------------
