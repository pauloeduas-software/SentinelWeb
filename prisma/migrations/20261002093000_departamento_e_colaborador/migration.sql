-- AlterTable
ALTER TABLE "users" ADD COLUMN     "address" TEXT,
ADD COLUMN     "departmentId" UUID,
ADD COLUMN     "employeeNumber" TEXT,
ADD COLUMN     "hiredAt" TIMESTAMP(3),
ADD COLUMN     "jobTitle" TEXT,
ADD COLUMN     "managerId" UUID,
ADD COLUMN     "phone" TEXT;

-- CreateTable
CREATE TABLE "departments" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "managerId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "departments_name_key" ON "departments"("name");

-- CreateIndex
CREATE INDEX "departments_managerId_idx" ON "departments"("managerId");

-- CreateIndex
CREATE INDEX "users_departmentId_idx" ON "users"("departmentId");

-- CreateIndex
CREATE INDEX "users_managerId_idx" ON "users"("managerId");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;



-- ═══════════════════════════════════════════════════════════════════════════
-- A MATRÍCULA É ÚNICA POR ÍNDICE PARCIAL, não por `@unique`.
--
-- Mesmo caso de `email` e `username`: com `@unique` comum, um colaborador na
-- lixeira bloquearia para sempre o recadastro da mesma matrícula — e matrícula é
-- justamente o número que a empresa reaproveita ao recontratar alguém.
--
-- O Prisma não expressa índice parcial, então ele mora aqui. E por isso o
-- `migrate diff` o IGNORA em vez de tentar removê-lo nas migrações seguintes
-- (ao contrário dos índices comuns, que precisam estar declarados no schema).
-- ═══════════════════════════════════════════════════════════════════════════
CREATE UNIQUE INDEX "users_employeeNumber_unico_ativo"
  ON "users"("employeeNumber")
  WHERE "employeeNumber" IS NOT NULL AND "deletedAt" IS NULL;


-- ═══════════════════════════════════════════════════════════════════════════
-- O BACKFILL DO DEPARTAMENTO — migração 1 de 2 (D75).
--
-- CRIA, ACRESCENTA A FK E PREENCHE **NA MESMA TRANSAÇÃO**. O `DROP COLUMN
-- users.department` fica para a migração SEGUINTE, depois do deploy validado e
-- da revisão manual da lista: entre as duas, um rollback ainda encontra o texto
-- original. Com os três passos num commit só, um rollback é perda de dado.
--
-- ⚠️ O QUE ESTE `GROUP BY` NÃO RESOLVE, e é o aviso que vale mais que o SQL:
-- `btrim` tira espaço nas pontas e NADA MAIS. `Comercial`, `comercial` e
-- `COMERCIAL` entram como TRÊS departamentos, e `Financeiro ` com espaço no
-- meio não casa com `Financeiro`.
--
-- Isto é de propósito: unificar por `lower(btrim(...))` escolheria
-- arbitrariamente qual grafia sobrevive, e `TI` contra `Ti` contra `ti` não tem
-- resposta automática certa. A lista PRECISA ser revisada à mão antes da
-- migração 2 de 2 — depois do `DROP COLUMN` o texto original não existe mais
-- para conferência, e aí a fusão de duplicatas é adivinhação.
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO "departments" ("id", "name", "createdAt", "updatedAt")
SELECT gen_random_uuid(), btrim("department"), now(), now()
  FROM "users"
 WHERE "department" IS NOT NULL AND btrim("department") <> ''
 GROUP BY btrim("department")
ON CONFLICT ("name") DO NOTHING;

UPDATE "users" u
   SET "departmentId" = d."id"
  FROM "departments" d
 WHERE d."name" = btrim(u."department")
   AND u."department" IS NOT NULL
   AND u."departmentId" IS NULL;
