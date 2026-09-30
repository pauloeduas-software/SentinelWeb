-- ---------------------------------------------------------------------------
-- A DEPRECIAÇÃO GANHA DONO — docs/FASE-8-PLANO-ITAM.md, Etapa C
--
-- Uma coluna e uma FK. A tabela `depreciations` existe desde a F1 e ninguém
-- apontava para ela: o `countUsages` da spec devolvia `0` fixo, então apagar uma
-- regra EM USO era permitido — só não havia uso.
--
-- A âncora é o MODELO e não o ativo: `assets` não tem `categoryId` (a categoria
-- vem do modelo), e vida útil contábil é característica do equipamento.
--
-- `RESTRICT`: apagar uma regra usada por um modelo passa a ser 409, com a
-- contagem real na frase.
-- ---------------------------------------------------------------------------

-- AlterTable
ALTER TABLE "asset_models" ADD COLUMN     "depreciationId" UUID;

-- CreateIndex
CREATE INDEX "asset_models_depreciationId_idx" ON "asset_models"("depreciationId");

-- AddForeignKey
ALTER TABLE "asset_models" ADD CONSTRAINT "asset_models_depreciationId_fkey" FOREIGN KEY ("depreciationId") REFERENCES "depreciations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
