-- Aceite do termo de entrega (Leva 4 do docs/FECHAMENTO-F2-F4-PLANO-ITAM.md).
--
-- `Category.requireAcceptance`, `eulaText` e `checkinEmail` existem desde a F1
-- e NUNCA foram lidos por nada. É esta migração que lhes dá dono.
--
-- `checkoutStatusId`/`checkinStatusId` no `app_settings` fecham o "qual rótulo
-- IN_USE?" que ficou pendente na F4: vazios, continua valendo o primeiro do
-- tipo por nome — que funciona com 8 rótulos e vira loteria com 12.

-- AlterTable
ALTER TABLE "app_settings" ADD COLUMN     "checkinStatusId" UUID,
ADD COLUMN     "checkoutStatusId" UUID;

-- CreateTable
CREATE TABLE "acceptances" (
    "id" UUID NOT NULL,
    "assignmentId" UUID NOT NULL,
    "assetId" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "eulaSnapshot" TEXT NOT NULL,
    "signerUserId" UUID,
    "signerName" TEXT NOT NULL,
    "signerEmail" TEXT NOT NULL,
    "signaturePath" TEXT,
    "pdfPath" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "declinedAt" TIMESTAMP(3),
    "declineReason" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "remindedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "acceptances_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "acceptances_token_key" ON "acceptances"("token");

-- CreateIndex
CREATE INDEX "acceptances_assetId_idx" ON "acceptances"("assetId");

-- CreateIndex
CREATE INDEX "acceptances_acceptedAt_idx" ON "acceptances"("acceptedAt");

-- AddForeignKey
ALTER TABLE "acceptances" ADD CONSTRAINT "acceptances_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "acceptances" ADD CONSTRAINT "acceptances_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- UM ACEITE PENDENTE POR POSSE, garantido pelo BANCO.
--
-- Índice parcial, à mão, porque o Prisma não expressa `WHERE` — mesmo caso de
-- `assignments_um_aberto_por_ativo` e `location_occupants_um_aberto_por_pessoa_local`.
--
-- O que ele impede: reenviar o termo criando uma segunda linha pendente para a
-- mesma entrega. Aí existiriam DOIS tokens válidos para um fato, e o segundo a
-- ser assinado sobrescreveria a leitura do primeiro — com duas assinaturas
-- diferentes no banco e nenhuma regra dizendo qual vale. Reenviar é remandar o
-- e-mail do MESMO token, e é isso que `remindedAt` registra.
--
-- Note o `WHERE "acceptedAt" IS NULL`: termo ASSINADO não entra no índice, e é
-- por isso que uma segunda entrega do mesmo ativo — depois da devolução — pode
-- emitir um termo novo sem esbarrar aqui.
CREATE UNIQUE INDEX "acceptances_um_pendente_por_posse"
  ON "acceptances"("assignmentId") WHERE "acceptedAt" IS NULL;
