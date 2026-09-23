-- DropIndex
--
-- CORRIGIDO À MÃO, DUAS VEZES.
--
-- 1ª correção (Fase 0): o `migrate diff` gerou `DROP INDEX "users_email_key"`,
--    que o Postgres recusa (2BP01) quando esse índice sustenta uma CONSTRAINT —
--    ele só cai junto com ela. Virou `DROP CONSTRAINT`.
--
-- 2ª correção (auditoria da Fase 1): `DROP CONSTRAINT` funciona no banco de
--    desenvolvimento, que nasceu de `db push` e por isso tem uma CONSTRAINT —
--    mas QUEBRA em banco novo, porque o `0_init` cria `CREATE UNIQUE INDEX`.
--    Como o `0_init` foi adotado com `migrate resolve --applied` e nunca rodou,
--    essa divergência ficou invisível até alguém tentar subir do zero.
--
-- O bloco abaixo funciona nas duas origens. A unicidade volta no fim do arquivo,
-- como índice PARCIAL (`WHERE deleted_at IS NULL`).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_email_key') THEN
    ALTER TABLE "users" DROP CONSTRAINT "users_email_key";
  ELSE
    DROP INDEX IF EXISTS "users_email_key";
  END IF;
END $$;

-- AlterTable
ALTER TABLE "inventory_items" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "activity_logs" (
    "id" UUID NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "changes" JSONB,
    "actorId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "activity_logs_entityType_entityId_createdAt_idx" ON "activity_logs"("entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "activity_logs_createdAt_idx" ON "activity_logs"("createdAt");

-- CreateIndex
CREATE INDEX "inventory_items_deletedAt_idx" ON "inventory_items"("deletedAt");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_deletedAt_idx" ON "users"("deletedAt");


-- ÍNDICE ÚNICO PARCIAL — escrito à mão, não gerado pelo `migrate diff`.
--
-- O Prisma não tem sintaxe para índice parcial, então o `@unique` de `email`
-- saiu do schema e a unicidade passa a ser esta. Com um `UNIQUE` comum, um
-- usuário na lixeira (deletedAt preenchido) bloquearia para sempre o recadastro
-- do mesmo e-mail. É o `unique_undeleted` do Snipe-IT.
--
-- Ao renomear/adicionar colunas únicas na Fase 2 (assetTag, serial), repetir
-- este padrão em vez de usar @unique.
CREATE UNIQUE INDEX "users_email_unique_undeleted"
  ON "users"("email")
  WHERE "deletedAt" IS NULL;
