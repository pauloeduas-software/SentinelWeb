-- Anexos e autoria do ativo (Leva 2 do docs/FECHAMENTO-F2-F4-PLANO-ITAM.md).
--
-- `imagePath` nas quatro tabelas e `attachments` guardam CAMINHO, nunca bytes:
-- os arquivos moram no `UPLOAD_DIR` e quem os escreve é `server/core/storage/`
-- (D83). E eles NÃO são servidos como estático — saem por
-- `GET /api/attachments/:id/download`, com sessão (D84): em produção o guard
-- libera todo GET fora de `/api`, então uma raiz `/uploads/*` deixaria nota
-- fiscal e contrato legíveis sem login.
--
-- `createdById`/`updatedById` entram SÓ no ativo (D26): o `ActivityLog` já
-- responde "quem criou isto"; a coluna existe para a tela de detalhe não fazer
-- essa consulta por linha. Sem FK para `users`, como o `ActivityLog.actorId` —
-- autoria é carimbo, não vínculo, e não pode impedir a exclusão de ninguém.
--
-- NADA de `DROP INDEX` aqui: `assets_retiredAt_idx` e
-- `locations_isWorkstation_idx` nasceram à mão e agora estão declarados no
-- schema, senão o `migrate diff` os derrubaria a cada migração nova.

-- AlterTable
ALTER TABLE "asset_models" ADD COLUMN     "imagePath" TEXT;

-- AlterTable
ALTER TABLE "assets" ADD COLUMN     "createdById" UUID,
ADD COLUMN     "imagePath" TEXT,
ADD COLUMN     "updatedById" UUID;

-- AlterTable
ALTER TABLE "categories" ADD COLUMN     "imagePath" TEXT;

-- AlterTable
ALTER TABLE "manufacturers" ADD COLUMN     "imagePath" TEXT;

-- CreateTable
CREATE TABLE "attachments" (
    "id" UUID NOT NULL,
    "assetId" UUID NOT NULL,
    "path" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "uploadedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "attachments_assetId_idx" ON "attachments"("assetId");

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

