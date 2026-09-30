-- ---------------------------------------------------------------------------
-- A CENTRAL DE ALERTAS — docs/FASE-8-PLANO-ITAM.md, Etapa E
--
-- Escrita à mão, aditiva. O que merece o olho:
--
--   1. NÃO EXISTE `app_settings."lastAlertRunAt"` nesta migração, e a ausência é
--      a decisão (D79). A janela de execução de cada job é uma LINHA em
--      `job_runs` — que já existe desde a F4 — com o nome do job como chave. Uma
--      coluna aqui seria disputada pelo lembrete de atraso e pelos alertas: o
--      segundo a acordar receberia `count: 0`, leria como "já rodou hoje" e
--      nunca executaria. Todo dia, sem erro e sem log.
--
--   2. `alerts."dedupeKey"` é UNIQUE, e é ele que faz a rodada repetida não
--      duplicar nada via `createMany({ skipDuplicates: true })` — sem SELECT
--      prévio, sem corrida entre dois processos.
--
--   3. `alerts."assetId"` é `CASCADE`: ativo apagado DE VERDADE não deixa aviso
--      órfão no sino. Apagar pela lixeira (que é UPDATE) não dispara isto, e por
--      isso a listagem do sino filtra `deletedAt` por conta própria.
-- ---------------------------------------------------------------------------

-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('GARANTIA_VENCENDO', 'EOL_PROXIMO', 'AUDITORIA_VENCIDA', 'MANUTENCAO_EM_ABERTO');

-- AlterTable
ALTER TABLE "app_settings" ADD COLUMN     "alertEmails" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "alertHour" INTEGER NOT NULL DEFAULT 8,
ADD COLUMN     "alertWebhookUrl" TEXT,
ADD COLUMN     "alertsEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "eolAlertDays" INTEGER NOT NULL DEFAULT 60,
ADD COLUMN     "maintenanceOpenDays" INTEGER NOT NULL DEFAULT 15,
ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
ADD COLUMN     "warrantyAlertDays" INTEGER NOT NULL DEFAULT 30;

-- CreateTable
CREATE TABLE "alerts" (
    "id" UUID NOT NULL,
    "type" "AlertType" NOT NULL,
    "assetId" UUID,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),
    "notifiedAt" TIMESTAMP(3),

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "alerts_dedupeKey_key" ON "alerts"("dedupeKey");

-- CreateIndex: o sino — não lidos, por prazo.
CREATE INDEX "alerts_readAt_dueAt_idx" ON "alerts"("readAt", "dueAt");

-- CreateIndex: a varredura de reenvio — o que ficou sem entrega.
CREATE INDEX "alerts_notifiedAt_idx" ON "alerts"("notifiedAt");

-- CreateIndex
CREATE INDEX "alerts_assetId_idx" ON "alerts"("assetId");

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
